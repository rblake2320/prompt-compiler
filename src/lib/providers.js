/**
 * Media Provider Adapters for Prompt Compiler.
 *
 * Each adapter takes a config + input and returns generated media
 * as a blob URL or base64 data URI.
 */

import { getMediaKeys } from './router.js';
import { getSettings } from './settings.js';

// ─── Image Generation ─────────────────────────────────────────────

export async function generateImageDalle(params) {
  const { prompt, size = '1024x1024', style = 'vivid', quality = 'standard' } = params;
  const keys = getMediaKeys();
  const apiKey = keys.openai || getSettings().apiKey;
  if (!apiKey) throw new Error('No OpenAI API key configured. Add one in Settings → Model Router → Media Keys.');

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'dall-e-3', prompt, n: 1, size, style, quality, response_format: 'b64_json' }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`DALL-E error ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  const b64 = data.data[0].b64_json;
  return { url: `data:image/png;base64,${b64}`, revised_prompt: data.data[0].revised_prompt || prompt, format: 'png', provider: 'dall-e-3' };
}

export async function generateImageStability(params) {
  const { prompt, negative_prompt = '', aspect_ratio = '1:1', style_preset, output_format = 'png' } = params;
  const keys = getMediaKeys();
  const apiKey = keys.stability;
  if (!apiKey) throw new Error('No Stability AI API key configured. Add one in Settings → Model Router → Media Keys.');

  const formData = new FormData();
  formData.append('prompt', prompt);
  if (negative_prompt) formData.append('negative_prompt', negative_prompt);
  formData.append('aspect_ratio', aspect_ratio);
  formData.append('output_format', output_format);
  if (style_preset) formData.append('style_preset', style_preset);

  const res = await fetch('https://api.stability.ai/v2beta/stable-image/generate/core', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' },
    body: formData,
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Stability AI error ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return { url: `data:image/${output_format};base64,${data.image}`, format: output_format, provider: 'stability-ai' };
}

export async function generateImage(params, preferredProvider = null) {
  const provider = preferredProvider || detectImageProvider();
  switch (provider) {
    case 'openai-dalle': case 'dall-e-3': return generateImageDalle(params);
    case 'stability': case 'stability-ai': return generateImageStability(params);
    default:
      try { return await generateImageDalle(params); }
      catch (e) { try { return await generateImageStability(params); } catch { throw e; } }
  }
}

function detectImageProvider() {
  const keys = getMediaKeys();
  if (keys.openai || getSettings().apiKey) return 'openai-dalle';
  if (keys.stability) return 'stability';
  return 'openai-dalle';
}

// ─── Text-to-Speech ───────────────────────────────────────────────

export async function generateSpeechOpenAI(params) {
  const { text, voice = 'nova', model = 'tts-1', speed = 1.0 } = params;
  const keys = getMediaKeys();
  const apiKey = keys.openai || getSettings().apiKey;
  if (!apiKey) throw new Error('No OpenAI API key configured for TTS.');

  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model, input: text, voice, speed, response_format: 'mp3' }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`OpenAI TTS error ${res.status}: ${err.slice(0, 200)}`);
  }
  const blob = await res.blob();
  return { url: URL.createObjectURL(blob), blob, format: 'mp3', provider: 'openai-tts', voice, duration_estimate: Math.ceil(text.split(/\s+/).length / 2.5) };
}

export async function generateSpeechElevenLabs(params) {
  const { text, voice_id = '21m00Tcm4TlvDq8ikWAM', model_id = 'eleven_multilingual_v2' } = params;
  const keys = getMediaKeys();
  const apiKey = keys.elevenlabs;
  if (!apiKey) throw new Error('No ElevenLabs API key configured.');

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
    body: JSON.stringify({ text, model_id, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`ElevenLabs error ${res.status}: ${err.slice(0, 200)}`);
  }
  const blob = await res.blob();
  return { url: URL.createObjectURL(blob), blob, format: 'mp3', provider: 'elevenlabs', voice_id };
}

export async function generateSpeech(params, preferredProvider = null) {
  const provider = preferredProvider || detectSpeechProvider();
  switch (provider) {
    case 'openai-tts': return generateSpeechOpenAI(params);
    case 'elevenlabs': return generateSpeechElevenLabs(params);
    default:
      try { return await generateSpeechOpenAI(params); }
      catch (e) { try { return await generateSpeechElevenLabs(params); } catch { throw e; } }
  }
}

function detectSpeechProvider() {
  const keys = getMediaKeys();
  if (keys.openai || getSettings().apiKey) return 'openai-tts';
  if (keys.elevenlabs) return 'elevenlabs';
  return 'openai-tts';
}

// ─── Utilities ────────────────────────────────────────────────────

export function blobToDataUri(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function dataUriToBlob(dataUri) {
  const [header, data] = dataUri.split(',');
  const mime = header.match(/:(.*?);/)[1];
  const binary = atob(data);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
  return new Blob([array], { type: mime });
}

export function getConfiguredProviders() {
  const keys = getMediaKeys();
  const mainKey = getSettings().apiKey;
  const configured = [];
  if (keys.openai || mainKey) {
    configured.push({ key: 'openai-dalle', name: 'DALL-E 3', type: 'image' });
    configured.push({ key: 'openai-tts', name: 'OpenAI TTS', type: 'speech' });
  }
  if (keys.stability) configured.push({ key: 'stability', name: 'Stability AI', type: 'image' });
  if (keys.elevenlabs) configured.push({ key: 'elevenlabs', name: 'ElevenLabs', type: 'speech' });
  return configured;
}
