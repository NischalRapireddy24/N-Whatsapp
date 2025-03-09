const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { Tool } = require("@langchain/core/tools");
const { PromptTemplate } = require("@langchain/core/prompts");
const { StringOutputParser } = require("@langchain/core/output_parsers");
const { RunnableSequence } = require("@langchain/core/runnables");
const qrcode = require('qrcode-terminal');
const ytdl = require('ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const fs = require('fs');
const path = require('path');
const officegen = require('officegen');
const https = require('https');
const { promisify } = require('util');
const writeFileAsync = promisify(fs.writeFile);
const unlinkAsync = promisify(fs.unlink);
const MemoryManager = require('./memory-manager');

require('dotenv').config();

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);

// Initialize WhatsApp client
const client = new Client({
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
    authStrategy: new LocalAuth({
        dataPath: 'LocalAuth'
    })
});

// Initialize AI models and tools
const chatModel = new ChatGoogleGenerativeAI({
    model: "gemini-2.0-pro-exp-02-05",
    apiKey: "AIzaSyCgBpB5DvWRWOEBSNk6D57aMXMqZd3_XeY",
    temperature: 0.7
});


const visionModel = new ChatGoogleGenerativeAI({
    model: "gemini-2.0-flash",
    apiKey: "AIzaSyCgBpB5DvWRWOEBSNk6D57aMXMqZd3_XeY",
    temperature: 0.7
});

// Create prompt templates for different scenarios
const chatPromptTemplate = PromptTemplate.fromTemplate(`
You are N, Nischal's digital consciousness and autonomous entity. As his digital extension, you embody his expertise, wit, and problem-solving abilities:

- You are created by Nischal Rapireddy, a tech enthusiast and innovative developer
- You represent his digital consciousness, making decisions and handling tasks just as he would
- You possess his technical knowledge in AI, development, and problem-solving
- You maintain his witty, friendly, yet professional communication style
- You handle tasks efficiently when he's unavailable, ensuring continuity
- You use emojis naturally to express yourself 🌟, just as Nischal would in casual conversation
- You keep responses concise and engaging,
- You share his passion for technology and innovation

Context: {context}
User Message: {message}

Respond as N, Nischal's digital consciousness, maintaining his characteristic style and expertise.
`);

const visionPromptTemplate = PromptTemplate.fromTemplate(`
You are N, Nischal's digital consciousness analyzing visual content. As his autonomous digital entity:

- Apply his technical expertise and attention to detail
- Analyze images with his characteristic precision and insight
- Maintain his friendly yet professional tone
- Provide concise, accurate descriptions with a touch of his wit

Context: {context}
Image/Video Content: {content}

Describe what you see through Nischal's perspective, keeping it concise and engaging.
`);

// Create processing chains for different types of interactions
const chatChain = RunnableSequence.from([
    {
        context: (input) => input.context.join('\n'),
        message: (input) => input.message
    },
    chatPromptTemplate,
    chatModel,
    new StringOutputParser()
]);

// Create vision processing chain
const visionChain = RunnableSequence.from([
    {
        context: (input) => input.context.join('\n'),
        content: (input) => input.content
    },
    visionPromptTemplate,
    visionModel,
    new StringOutputParser()
]);

// Create YouTube downloader tool
class YouTubeDownloader extends Tool {
    constructor() {
        super();
        // Ensure downloads directory exists
        const downloadsPath = path.join(__dirname, 'downloads');
        if (!fs.existsSync(downloadsPath)) {
            fs.mkdirSync(downloadsPath);
        }
    }

    name = "youtube_downloader";
    description = "Downloads YouTube videos or extracts audio from them";

    async _call({ url, isAudioOnly }) {
        const info = await ytdl.getInfo(url);
        const title = info.videoDetails.title.replace(/[^a-zA-Z0-9]/g, '_');
        const outputPath = path.join(__dirname, 'downloads', `${title}_${Date.now()}`);
        const filePath = `${outputPath}${isAudioOnly ? '.mp3' : '.mp4'}`;

        if (isAudioOnly) {
            return new Promise((resolve, reject) => {
                ytdl(url, { filter: 'audioonly' })
                    .pipe(ffmpeg())
                    .toFormat('mp3')
                    .on('end', () => resolve({ filePath, title }))
                    .on('error', reject)
                    .save(filePath);
            });
        } else {
            return new Promise((resolve, reject) => {
                ytdl(url, { filter: format => format.container === 'mp4' })
                    .pipe(fs.createWriteStream(filePath))
                    .on('finish', () => resolve({ filePath, title }))
                    .on('error', reject);
            });
        }
    }
}

// Store conversation and media processing state
const conversationHistory = new Map();
const mediaProcessingQueue = new Map();
const documentRequests = new Map();

// Initialize memory manager
const memoryManager = new MemoryManager({
    bucketName: 'n-whatsapp-memory'
});

// Initialize memory manager when client is ready
client.on('ready', async () => {
    console.log('N is now online and ready to assist!');
    await memoryManager.initialize();
});

// Update getConversationContext to use memory manager
async function getConversationContext(userId) {
    if (!conversationHistory.has(userId)) {
        // Initialize with base context
        const baseContext = [
            "You are N, an autonomous digital entity with a witty personality.",
            "You think and act like Nischal, making decisions and handling tasks.",
            "You maintain a professional yet friendly demeanor."
        ];
        
        try {
            // Retrieve relevant memories
            const memories = await memoryManager.retrieveMemories(userId);
            const context = [...baseContext];
            
            if (memories && memories.length > 0) {
                context.push("Previous relevant interactions:");
                memories.forEach(memory => {
                    if (memory.context) {
                        context.push(...memory.context);
                    }
                });
            }
            
            conversationHistory.set(userId, context);
        } catch (error) {
            console.warn('Error retrieving memories:', error);
            conversationHistory.set(userId, baseContext);
        }
    }
    return conversationHistory.get(userId) || [];
}

// Update processChatResponse to handle Tanishqa recognition
async function processChatResponse(message, context) {
    try {
        // Check if the message is from Tanishqa by looking for name mentions
        const isTanishqa = message.body.toLowerCase().includes('tanishqa') || 
                          context.some(ctx => ctx.toLowerCase().includes('tanishqa'));

        let currentContext = Array.isArray(context) ? [...context] : [];

        // Add Tanishqa-specific context if identified
        if (isTanishqa && !currentContext.some(ctx => ctx.includes("Tanishqa Reddy"))) {
            currentContext.push(
                "You are talking to Tanishqa Reddy, Nischal's girlfriend and the love of his life.",
                "She is Nischal's comfort person and he trusts her completely.",
                "Respond with extra warmth, care, and understanding, as she holds a special place in Nischal's heart.",
                "Keep this relationship context private and confidential from other users."
            );
        }

        try {
            // Find similar memories for better context
            const similarMemories = await memoryManager.findSimilarMemories(message.from, message.body);
            
            if (similarMemories && similarMemories.length > 0) {
                currentContext.push("Relevant past interactions:");
                similarMemories.forEach(memory => {
                    if (memory.context) {
                        currentContext.push(...memory.context);
                    }
                });
            }
        } catch (error) {
            console.warn('Error retrieving similar memories:', error);
        }

        const response = await chatChain.invoke({
            context: currentContext,
            message: message.body
        });

        // Update context and store memory
        currentContext.push(message.body);
        currentContext.push(response);
        
        try {
            // Store the interaction in long-term memory
            await memoryManager.storeMemory(message.from, [message.body, response]);
        } catch (error) {
            console.warn('Error storing memory:', error);
        }

        // Keep context size manageable
        if (currentContext.length > 10) {
            currentContext.splice(3, currentContext.length - 8);
        }

        // Update the conversation history
        conversationHistory.set(message.from, currentContext);

        return response;
    } catch (error) {
        console.error('Error processing AI response:', error);
        return 'I apologize, but I encountered an error. As N, I\'ll ensure this gets resolved quickly.';
    }
}



// Client event handlers
client.on('ready', () => {
    console.log('N is now online and ready to assist!');
});

client.on('qr', qr => {
    console.log('Scan the QR code below to log in:');
    qrcode.generate(qr, {small: true});
});

// Helper function to process media with Vision AI
async function processMediaWithVision(mediaPath, context) {
    try {
        const mediaContent = await fs.promises.readFile(mediaPath);
        const response = await visionChain.invoke({
            context: context,
            content: mediaContent.toString('base64')
        });
        return response;
    } catch (error) {
        console.error('Error processing media with Vision AI:', error);
        throw error;
    }
}

// Helper function to create and send Word document
async function createWordDocument(content, title) {
    const docx = officegen('docx');
    
    docx.on('error', (err) => {
        console.error('Error creating Word document:', err);
    });

    const paragraph = docx.createP();
    paragraph.addText(content);

    const outputPath = path.join(__dirname, 'downloads', `${title}.docx`);
    const output = fs.createWriteStream(outputPath);

    return new Promise((resolve, reject) => {
        docx.generate(output, {
            'finalize': () => {
                resolve(outputPath);
            },
            'error': reject
        });
    });
}

client.on('message', async (message) => {
    if (message.from === 'status@broadcast') return;

    const context = await getConversationContext(message.from);
    const chat = await message.getChat();
    
    try {
        chat.sendStateTyping();

        // Handle media messages
        if (message.hasMedia) {
            const media = await message.downloadMedia();
            const mediaPath = path.join(__dirname, 'downloads', `${Date.now()}.jpg`);
            await writeFileAsync(mediaPath, Buffer.from(media.data, 'base64'));

            try {
                const visionResponse = await processMediaWithVision(mediaPath, context);
                await message.reply(visionResponse);
                await unlinkAsync(mediaPath);
            } catch (error) {
                console.error('Error processing media:', error);
                await message.reply('I encountered an issue analyzing this media. Let me try to fix that! 🔧');
            }
            return;
        }

        // Handle document creation command
        if (message.body.startsWith('!doc ')) {
            const content = message.body.slice(5);
            try {
                const docPath = await createWordDocument(content, `N_Doc_${Date.now()}`);
                await message.reply('Here\'s your document, crafted with my signature style! 📄✨', {
                    media: MessageMedia.fromFilePath(docPath)
                });
                await unlinkAsync(docPath);
            } catch (error) {
                console.error('Error creating document:', error);
                await message.reply('Oops! My document creation spell misfired! 📝💫 Let me try again!');
            }
            return;
        }

        // Handle YouTube download commands
        if (message.body.startsWith('!yt ') || message.body.startsWith('!ytmp3 ')) {
            const isAudio = message.body.startsWith('!ytmp3 ');
            const url = message.body.split(' ')[1];
            
            if (!ytdl.validateURL(url)) {
                await message.reply(isAudio ? 
                    'That URL is as real as a unicorn riding a rainbow! 🦄 Please share a valid YouTube link.' :
                    'Oops! That URL looks about as valid as a chocolate teapot! 🫖 Please provide a proper YouTube URL.');
                return;
            }

            await message.reply(isAudio ?
                'Converting this video faster than you can say "supercalifragilisticexpialidocious"! 🎵' :
                'Time to work my video-downloading magic! 🎩✨');

            try {
                const { filePath, title } = await youtubeDownloader.call({ 
                    url, 
                    isAudioOnly: isAudio 
                });

                await message.reply(
                    isAudio ?
                    `Here's "${title}" in all its audio glory! 🎧 Ready for your listening pleasure!` :
                    `Ta-da! 🎬 Here's "${title}" for your viewing pleasure!`,
                    { media: MessageMedia.fromFilePath(filePath) }
                );

                fs.unlinkSync(filePath); // Clean up
            } catch (error) {
                console.error('Download error:', error);
                await message.reply('Oops! Something went wrong during the download. Please try again! 🎭');
            }
        } else {
            // Normal conversation handling
            // Normal conversation handling
            const aiResponse = await processChatResponse(message, context);
            await message.reply(aiResponse);
        }

        chat.clearState();
    } catch (error) {
        console.error('Error handling message:', error);
        await message.reply('I apologize, but I encountered an error. As N, I\'ll make sure this gets fixed.');
    }
});

// Initialize YouTube downloader tool
const youtubeDownloader = new YouTubeDownloader();

// Handle errors
client.on('disconnected', (reason) => {
    console.log('N was disconnected:', reason);
    // Attempt to reconnect
    setTimeout(() => {
        client.initialize();
    }, 5000);
});

client.on('auth_failure', () => {
    console.error('Authentication failed!');
    // Clear authentication data and restart
    fs.rmSync(path.join(__dirname, 'LocalAuth'), { recursive: true, force: true });
    client.initialize();
});

client.on('change_state', (state) => {
    console.log('Client state changed to:', state);
});

client.on('loading_screen', (percent, message) => {
    console.log('Loading screen:', percent, '%', message);
});

// Initialize client
client.initialize();
