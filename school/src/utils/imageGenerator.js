/**
 * Image Generator Utility
 * Handles communication with the SillyTavern image generation plugin
 */

const EventType = {
    GENERATE_IMAGE_REQUEST: 'generate-image-request',
    GENERATE_IMAGE_RESPONSE: 'generate-image-response',
};

// Generate unique ID for requests
const generateUniqueId = () => {
    return 'req-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
};

/**
 * Request image generation
 * @param {string} prompt The main prompt
 * @param {string} change Optional change prompt
 * @param {number} width Optional width
 * @param {number} height Optional height
 * @returns {Promise<string>} Base64 image data or throws error
 */
export async function requestImageGeneration(prompt, change, width, height) {
    if (!window.eventEmit || !window.eventOn || !window.eventRemoveListener) {
        console.warn('[ImageGenerator] Event functions not available (not in ST environment?)');
        return null;
    }

    return new Promise(async (resolve, reject) => {
        const requestId = generateUniqueId();
        const requestData = {
            id: requestId,
            prompt: prompt,
            change: change || '',
            width: width ? parseInt(width, 10) : null,
            height: height ? parseInt(height, 10) : null,
        };

        console.log(`[ImageGenerator] Requesting image: ${requestId}`, requestData);

        // Define response handler
        const imageResponseHandler = (responseData) => {
            if (!responseData || responseData.id !== requestId) return;

            console.log(`[ImageGenerator] Received response for ${requestId}`);
            
            // Clean up listener
            try {
                window.eventRemoveListener(EventType.GENERATE_IMAGE_RESPONSE, imageResponseHandler);
            } catch (e) {
                console.warn('[ImageGenerator] Failed to remove listener:', e);
            }

            const { success, imageData, error } = responseData;

            if (success) {
                resolve(imageData);
            } else {
                reject(new Error(error || 'Unknown generation error'));
            }
        };

        // Set timeout to avoid hanging forever
        setTimeout(() => {
             // Remove listener if timed out
             try {
                window.eventRemoveListener(EventType.GENERATE_IMAGE_RESPONSE, imageResponseHandler);
            } catch (e) {}
            reject(new Error('Image generation timed out'));
        }, 120000); // 2 minutes timeout

        // Start listening
        window.eventOn(EventType.GENERATE_IMAGE_RESPONSE, imageResponseHandler);

        // Emit request
        try {
            await window.eventEmit(EventType.GENERATE_IMAGE_REQUEST, requestData);
        } catch (e) {
            reject(e);
        }
    });
}
