export { openai } from "../openai-instance";
export {
  detectAudioFormat,
  convertToWav,
  ensureCompatibleFormat,
  type AudioFormat,
  voiceChat,
  voiceChatStream,
  textToSpeech,
  textToSpeechStream,
  speechToText,
  speechToTextStream,
} from "./client";
