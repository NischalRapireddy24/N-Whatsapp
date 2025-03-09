# Memory Manager Setup Guide

## Prerequisites

1. Google Cloud Project
   - Create a new project or use an existing one in the [Google Cloud Console](https://console.cloud.google.com)
   - Enable the following APIs:
     - Google Cloud Storage API
     - Vertex AI API (for text embeddings)
   - Set up billing for your project (required for API usage)

2. Service Account Setup
   - Go to IAM & Admin > Service Accounts
   - Create a new service account
   - Grant the following roles:
     - Storage Admin (for bucket operations)
     - Vertex AI User (for text embeddings)
   - Create and download a JSON key file
   - Note: Keep this key file secure and never commit it to version control

## Configuration

1. Place the downloaded service account JSON key file in a secure location outside your project directory

2. Create a .env file in your project root and set up the following environment variables:
```env
# Full path to your service account key file
GOOGLE_APPLICATION_CREDENTIALS=/path/to/your-service-account-key.json

# Your Google Cloud project ID (found in Google Cloud Console)
GOOGLE_CLOUD_PROJECT=gaadhaar-987dd
```

3. Install required dependencies:
```bash
npm install @google-cloud/storage @google-cloud/vertexai uuid dotenv
```

4. Load environment variables in your application:
```javascript
require('dotenv').config();
```

## Usage

```javascript
const MemoryManager = require('./memory-manager');

// Initialize with custom config (optional)
const memoryManager = new MemoryManager({
  bucketName: 'custom-bucket-name', // optional, defaults to 'n-whatsapp-memory'
  maxMemoryAge: 7 * 24 * 60 * 60 * 1000 // optional, defaults to 30 days
});

// Initialize the memory system
await memoryManager.initialize();

// Store a memory
const memory = await memoryManager.storeMemory('user123', ['This is a memory context']);

// Retrieve memories
const memories = await memoryManager.retrieveMemories('user123', 5);

// Find similar memories
const similarMemories = await memoryManager.findSimilarMemories('user123', 'query text', 3);
```

## Security Considerations

1. Never commit your service account key file to version control
2. Use environment variables for sensitive configuration
3. Implement proper access controls for your application
4. Regularly rotate service account keys
5. Monitor API usage and set up billing alerts
6. Store the service account key file outside the project directory
7. Add .env to your .gitignore file

## Troubleshooting

If you encounter authentication errors:
1. Verify the GOOGLE_APPLICATION_CREDENTIALS path is correct and accessible
2. Ensure the service account has the required permissions (Storage Admin and Vertex AI User)
3. Check if the APIs are enabled in your Google Cloud project (Storage and Vertex AI)
4. Verify your project has billing enabled for the APIs
5. Check if your .env file is properly loaded in your application

Common issues and solutions:
- "Could not load the default credentials": Check if your GOOGLE_APPLICATION_CREDENTIALS path is correct
- "Permission denied": Verify service account roles and API enablement
- "Quota exceeded": Check your Google Cloud billing and quotas
- "Bucket doesn't exist": Ensure initialize() is called before other operations

For other issues, check the error messages in the console and verify your Google Cloud project settings.

## Cost Considerations

1. Monitor your API usage in the Google Cloud Console
2. Set up budget alerts to avoid unexpected charges
3. Be mindful of:
   - Storage costs for saved memories
   - API calls for text embeddings
   - Data transfer costs

For detailed pricing information, visit:
- [Google Cloud Storage Pricing](https://cloud.google.com/storage/pricing)
- [Vertex AI Pricing](https://cloud.google.com/vertex-ai/pricing)