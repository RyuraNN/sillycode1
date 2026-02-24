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

        // 标志位：防止重复处理响应
        let isHandled = false;
        let timeoutId = null;

        // 清理函数：确保监听器被移除
        const cleanup = () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            try {
                window.eventRemoveListener(EventType.GENERATE_IMAGE_RESPONSE, imageResponseHandler);
                console.log(`[ImageGenerator] Listener removed for ${requestId}`);
            } catch (e) {
                console.warn('[ImageGenerator] Failed to remove listener:', e);
            }
        };

        // Define response handler
        const imageResponseHandler = (responseData) => {
            // 忽略不匹配的响应，但不要在这里 return（继续让其他监听器处理）
            if (!responseData || responseData.id !== requestId) {
                return;
            }

            // 防止重复处理（超时后又收到响应）
            if (isHandled) {
                console.warn(`[ImageGenerator] Response for ${requestId} already handled, ignoring`);
                return;
            }

            isHandled = true;
            console.log(`[ImageGenerator] Received response for ${requestId}`, { success: responseData.success });

            // 清理监听器和超时
            cleanup();

            const { success, imageData, error } = responseData;

            if (success) {
                resolve(imageData);
            } else {
                reject(new Error(error || 'Unknown generation error'));
            }
        };

        // Set timeout to avoid hanging forever
        timeoutId = setTimeout(() => {
            if (isHandled) return;

            isHandled = true;
            console.warn(`[ImageGenerator] Request ${requestId} timed out`);
            cleanup();
            reject(new Error('Image generation timed out'));
        }, 120000); // 2 minutes timeout

        // Start listening
        try {
            window.eventOn(EventType.GENERATE_IMAGE_RESPONSE, imageResponseHandler);
            console.log(`[ImageGenerator] Listener registered for ${requestId}`);
        } catch (e) {
            cleanup();
            reject(new Error('Failed to register event listener: ' + e.message));
            return;
        }

        // Emit request
        try {
            await window.eventEmit(EventType.GENERATE_IMAGE_REQUEST, requestData);
            console.log(`[ImageGenerator] Request emitted for ${requestId}`);
        } catch (e) {
            cleanup();
            reject(e);
        }
    });
}
