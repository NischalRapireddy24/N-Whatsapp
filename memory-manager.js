const { v4: uuidv4 } = require('uuid');
const { GoogleGenerativeAIEmbeddings } = require('@langchain/google-genai');
const { MemoryVectorStore } = require('langchain/vectorstores/memory');

require('dotenv').config();

class MemoryManager {
    constructor(config = {}) {
        // Initialize Google Generative AI Embeddings
        this.embeddings = new GoogleGenerativeAIEmbeddings({
            model: 'text-embedding-004',
            apiKey: 'AIzaSyCgBpB5DvWRWOEBSNk6D57aMXMqZd3_XeY'
        });

        // Initialize Memory Vector Store
        this.vectorStore = new MemoryVectorStore(this.embeddings);

        // Configuration settings
        this.maxMemoryAge = config.maxMemoryAge || 30 * 24 * 60 * 60 * 1000; // 30 days
        this.maxResults = config.maxResults || 100; // Maximum number of memories to retrieve
    }

    async initialize() {
        try {
            console.log(`[${new Date().toISOString()}] Initializing memory manager`);
            // No initialization needed for MemoryVectorStore
            return true;
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Failed to initialize memory manager:`, error);
            throw new Error(`Memory initialization failed: ${error.message}`);
        }
    }

    async storeMemory(userId, context) {
        if (!userId || !context || !Array.isArray(context)) {
            console.error(`[${new Date().toISOString()}] Invalid parameters for storing memory - userId: ${userId}`);
            throw new Error('Invalid parameters for storing memory');
        }

        try {
            console.log(`[${new Date().toISOString()}] Storing memory for user ${userId}`);
            const text = Array.isArray(context) ? context.join('\n') : context;
            const embedding = await this.generateEmbedding(text);
            
            const memoryObject = {
                userId,
                context,
                timestamp: Date.now(),
                id: uuidv4(),
                embedding
            };

            await this.vectorStore.addDocuments([{
                pageContent: text,
                metadata: memoryObject,
                embedding
            }]);

            console.log(`[${new Date().toISOString()}] Successfully stored memory with ID ${memoryObject.id} for user ${userId}`);
            return memoryObject;
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Failed to store memory for user ${userId}:`, error);
            throw new Error(`Memory storage failed: ${error.message}`);
        }
    }

    async retrieveMemories(userId, limit = 10) {
        if (!userId) {
            console.error(`[${new Date().toISOString()}] Attempted to retrieve memories without userId`);
            throw new Error('User ID is required for retrieving memories');
        }

        try {
            console.log(`[${new Date().toISOString()}] Retrieving memories for user ${userId} with limit ${limit}`);
            const results = await this.vectorStore.similaritySearch('', Math.min(limit, this.maxResults));
            
            const memories = results
                .map(result => result.metadata)
                .filter(memory => 
                    memory.userId === userId && 
                    Date.now() - memory.timestamp <= this.maxMemoryAge
                )
                .sort((a, b) => b.timestamp - a.timestamp);

            console.log(`[${new Date().toISOString()}] Retrieved ${memories.length} memories for user ${userId}`);
            return memories;
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Failed to retrieve memories for user ${userId}:`, error);
            throw new Error(`Memory retrieval failed: ${error.message}`);
        }
    }

    async findSimilarMemories(userId, queryText, limit = 10) {
        if (!userId || !queryText) {
            console.error(`[${new Date().toISOString()}] Invalid parameters for finding similar memories - userId: ${userId}`);
            throw new Error('User ID and query text are required for finding similar memories');
        }

        try {
            console.log(`[${new Date().toISOString()}] Finding similar memories for user ${userId} with query: ${queryText.substring(0, 50)}...`);
            const results = await this.vectorStore.similaritySearch(queryText, limit);

            const memories = results
                .filter(result => result.metadata.userId === userId)
                .map(result => ({
                    ...result.metadata,
                    similarity: result.score
                }));

            console.log(`[${new Date().toISOString()}] Found ${memories.length} similar memories for user ${userId}`);
            return memories;
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Failed to find similar memories for user ${userId}:`, error);
            throw new Error(`Similar memory search failed: ${error.message}`);
        }
    }

    async generateEmbedding(text) {
        if (!text || typeof text !== 'string') {
            throw new Error('Invalid text for embedding generation');
        }

        try {
            const embeddings = await this.embeddings.embedQuery(text);
            if (!embeddings || !Array.isArray(embeddings)) {
                throw new Error('Invalid embedding response from API');
            }
            return embeddings;
        } catch (error) {
            console.warn('Google Generative AI embedding generation failed:', error);
            return this.generateFallbackEmbedding(text);
        }
    }

    generateFallbackEmbedding(text) {
        // Improved fallback embedding method using word-level features
        const words = text.toLowerCase().split(/\s+/);
        const vector = new Array(512).fill(0); // Use same dimensionality as Vertex AI

        words.forEach((word, i) => {
            const hash = this.hashString(word);
            const index = Math.abs(hash) % vector.length;
            vector[index] += 1 / Math.sqrt(i + 1); // Decay factor for word position
        });

        // Normalize the vector
        const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
        return vector.map(val => magnitude === 0 ? 0 : val / magnitude);
    }

    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash;
    }
}

module.exports = MemoryManager;