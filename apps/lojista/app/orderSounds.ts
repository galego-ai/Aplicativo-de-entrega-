import audioData from "./orderSoundData.json";

export const ORDER_SOUND_STORAGE_KEY = "clickfood-order-sound-v2";
export const ORDER_AUDIO_ENABLED_KEY = "clickfood-order-audio";
export const ORDER_SOUND_EVENT = "clickfood-order-sound-change";
export const ORDER_AUDIO_ENABLE_EVENT = "clickfood-order-audio-enable";
export const ORDER_SOUND_PREVIEW_EVENT = "clickfood-order-sound-preview";

export type OrderSound = {
  id: string;
  label: string;
  src: string;
};

const sounds = audioData as Record<string, string>;
const asAudio = (file: string) => `data:audio/mpeg;base64,${sounds[file] ?? ""}`;

// Os arquivos foram enviados pelo proprietário e reduzidos para clips curtos de alerta web.
// O painel repete o clip com intervalo enquanto o pedido aguarda aceite/recusa.
export const ORDER_SOUNDS: OrderSound[] = [
  { id: "classic", label: "Toque 1 • Clássico", src: asAudio("toque-01-classico.mp3") },
  { id: "normal", label: "Toque 2 • Normal", src: asAudio("toque-02-normal.mp3") },
  { id: "telephone", label: "Toque 3 • Telefone", src: asAudio("toque-03-telefone.mp3") },
  { id: "mobile", label: "Toque 4 • Mobile", src: asAudio("toque-04-mobile.mp3") },
  { id: "ring", label: "Toque 5 • Ring", src: asAudio("toque-05-ring.mp3") },
  { id: "alert-040", label: "Toque 6 • Alerta 040", src: asAudio("toque-06-alerta-040.mp3") },
  { id: "alert-050", label: "Toque 7 • Alerta 050", src: asAudio("toque-07-alerta-050.mp3") },
  { id: "alert-055", label: "Toque 8 • Alerta 055", src: asAudio("toque-08-alerta-055.mp3") },
  { id: "xmas", label: "Toque 9 • Especial", src: asAudio("toque-09-natal.mp3") },
];

export const DEFAULT_ORDER_SOUND = ORDER_SOUNDS[0];

export function resolveOrderSound(value: string | null | undefined) {
  return ORDER_SOUNDS.find((sound) => sound.id === value || sound.src === value) ?? DEFAULT_ORDER_SOUND;
}
