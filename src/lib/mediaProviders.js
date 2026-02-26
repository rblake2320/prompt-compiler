/**
 * Media Provider integrations — image generation, TTS, audio.
 * Each provider returns standardized output that can be injected into projects.
 */

import { getApiKeyForProvider } from './modelRouter.js';

// \u2500\u2500\u2500 Image Generation \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

/**
 * Generate an image using OpenAI's DALL-E.
 * @param {string} prompt - Image description
 * @param {object} opts - { size, quality, style }
 * @returns {Promise<{ url: string, base64?: string, revised_prompt: string }>}
 */
export async function generateImageDallE(prompt, opts = {}) {
  const apiKey = getApiKeyForProvider('openai');
  if (!apiKey) throw new Error('OpenAI API key required for DALL-E image generation. Add it in Settings \u2192 API Keys.');

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model || 'dall-e-3',
      prompt,
      n: 1,
      size: opts.size || '1024x1024',
      quality: opts.quality || 'standard',
      style: opts.style || 'natural',
      response_format: opts.returnBase64 ? 'b64_json' : 'url',
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`DALL-E error: ${err.error?.message || res.statusText}`);
  }

  const data = await res.json();
  const img = data.data[0];
  return {
    url: img.url || null,
    base64: img.b64_json || null,
    revised_prompt: img.revised_prompt || prompt,
    provider: 'dall-e-3',
  };
}

/**
 * Generate an image using Stability AI.
 * @param {string} prompt
 * @param {object} opts - { model, width, height, steps }
 * @returns {Promise<{ base64: string }>}
 */
export async function generateImageStability(prompt, opts = {}) {
  const apiKey = getApiKeyForProvider('stability');
  if (!apiKey) throw new Error('Stability AI API key required. Add it in Settings \u2192 API Keys.');

  const res = await fetch('https://api.stability.ai/v2beta/stable-image/generate/sd3', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json',
    },
    body: (() => {
      const fd = new FormData();
      fd.append('prompt', prompt);
      fd.append('model', opts.model || 'sd3-medium');
      fd.append('output_format', 'png');
      if (opts.width) fd.append('width', opts.width);
      if (opts.height) fd.append('height', opts.height);
      return fd;
    })(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Stability AI error: ${err.message || res.statusText}`);
  }

  const data = await res.json();
  return {
    base64: data.image,
    url: null,
    provider: 'stability-ai',
  };
}

// \u2500\u2500\u2500 Text-to-Speech \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

/**
 * OpenAI TTS voices
 */
export const OPENAI_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

/**
 * Generate speech using OpenAI TTS.
 * @param {string} text - Text to speak
 * @param {object} opts - { voice, model, speed }
 * @returns {Promise<{ audioBlob: Blob, audioUrl: string }>}
 */
export async function generateSpeechOpenAI(text, opts = {}) {
  const apiKey = getApiKeyForProvider('openai');
  if (!apiKey) throw new Error('OpenAI API key required for TTS. Add it in Settings \u2192 API Keys.');

  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model || 'tts-1',
      input: text,
      voice: opts.voice || 'nova',
      speed: opts.speed || 1.0,
      response_format: 'mp3',
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`TTS error: ${err.error?.message || res.statusText}`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);

  return {
    audioBlob: blob,
    audioUrl: url,
    provider: 'openai-tts',
    format: 'mp3',
  };
}

/**
 * Generate speech using ElevenLabs.
 * @param {string} text
 * @param {object} opts - { voiceId, modelId }
 * @returns {Promise<{ audioBlob: Blob, audioUrl: string }>}
 */
export async function generateSpeechElevenLabs(text, opts = {}) {
  const apiKey = getApiKeyForProvider('elevenlabs');
  if (!apiKey) throw new Error('ElevenLabs API key required. Add it in Settings \u2192 API Keys.');

  const voiceId = opts.voiceId || 'pNInz6obpgDQGcFmaJgB'; // Adam default
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: opts.modelId || 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`ElevenLabs error: ${err.detail?.message || res.statusText}`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);

  return {
    audioBlob: blob,
    audioUrl: url,
    provider: 'elevenlabs',
    format: 'mp3',
  };
}

// \u2500\u2500\u2500 Unified Media Generation \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

/**
 * Route image generation to the configured provider.
 * @param {string} prompt
 * @param {object} opts
 * @returns {Promise<{ url?: string, base64?: string, provider: string }>}
 */
export async function generateImage(prompt, opts = {}) {
  const provider = opts.provider || 'openai';

  switch (provider) {
    case 'openai':
      return generateImageDallE(prompt, opts);
    case 'stability':
      return generateImageStability(prompt, opts);
    default:
      throw new Error(`Unknown image provider: ${provider}`);
  }
}

/**
 * Route TTS to the configured provider.
 * @param {string} text
 * @param {object} opts
 * @returns {Promise<{ audioBlob: Blob, audioUrl: string, provider: string }>}
 */
export async function generateSpeech(text, opts = {}) {
  const provider = opts.provider || 'openai';

  switch (provider) {
    case 'openai':
      return generateSpeechOpenAI(text, opts);
    case 'elevenlabs':
      return generateSpeechElevenLabs(text, opts);
    default:
      throw new Error(`Unknown TTS provider: ${provider}`);
  }
}

/**
 * Convert an image result to a data URI for embedding in HTML.
 */
export function imageToDataUri(imageResult) {
  if (imageResult.base64) {
    return `data:image/png;base64,${imageResult.base64}`;
  }
  return imageResult.url || '';
}

/**
 * Convert an audio result to a data URI for embedding.
 */
export async function audioToDataUri(audioResult) {
  if (!audioResult.audioBlob) return audioResult.audioUrl;
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(audioResult.audioBlob);
  });
}
