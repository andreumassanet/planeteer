/** Sending a line, paced by the same rules as the relay, and the emote gestures. */
import { CHAT_CLIENT_INTERVAL_MS, chatWait, cleanChat, spendChat } from '../../server/src/limits.ts';
import type { Emote } from '../../server/src/limits.ts';
import type { ChatCtx } from './context.ts';
import type { ChatLog } from './log.ts';

export interface Say {
  say(text: string): void;
  gesture(name: Emote): void;
}

export function createSay({ host, state }: ChatCtx, chat: ChatLog): Say {
  const peers = host.peers;

  function say(text: string): void {
    const m = cleanChat(text);
    if (m === '') return;
    const now = Date.now();
    // At the game's own interval, slower than the relay's by the jitter a
    // socket may add (`CHAT_JITTER_MS`): refused here, never dropped there.
    const wait = chatWait(state.bucket, now, CHAT_CLIENT_INTERVAL_MS);
    if (wait > 0 || !spendChat(state.bucket, now, CHAT_CLIENT_INTERVAL_MS)) {
      chat.system(`Not so fast · you can say something again in ${Math.max(1, Math.ceil(wait / 1000))} s`, 'error');
      return;
    }
    const iso = host.here().iso;
    state.sentCount++;
    // The relay's copy comes back to us too, and that is the line shown.
    if (peers !== null && peers.send({ t: 'chat', m, c: iso })) return;
    chat.line(host.name() || 'You', iso, m, true, host.world);
    if (peers !== null) chat.system('Not connected · only you can see that', 'error');
  }

  function gesture(name: Emote): void {
    if (!host.emote(name)) chat.system('Only standing on the ground', 'error');
  }

  return { say, gesture };
}
