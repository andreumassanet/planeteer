/** The field's own keys: choosing and filling suggestions, closing, and walking back through what was sent. */
import type { ChatCtx } from './context.ts';
import type { Suggestions } from './suggestions.ts';

export interface FieldKeys {
  /** Forgets the line the arrows were walking back to. */
  resetRecall(): void;
}

export function attachFieldKeys({ dom, state, signal }: ChatCtx, suggestions: Suggestions, hide: () => void): FieldKeys {
  const { field } = dom;
  const { sent } = state;
  let recall = -1;
  let draft = '';

  field.addEventListener('keydown', (event) => {
    if (event.isComposing) return;
    const { offered, chosen } = suggestions;
    if (event.code === 'Escape') {
      event.preventDefault();
      if (offered.length > 0) {
        suggestions.dismissed = true;
        suggestions.refresh();
      } else hide();
    } else if (event.code === 'Tab') {
      // The focus stays in the field whatever `Tab` finds.
      event.preventDefault();
      if (offered.length > 0) suggestions.accept(chosen, false);
    } else if ((event.code === 'Enter' || event.code === 'NumpadEnter') && offered.length > 0) {
      const item = offered[chosen]!;
      // A line already written as the row says is simply sent.
      if (item.line.trimEnd() === field.value.trimEnd()) return;
      event.preventDefault();
      suggestions.accept(chosen, true);
    } else if ((event.code === 'ArrowUp' || event.code === 'ArrowDown') && offered.length > 0) {
      event.preventDefault();
      const step = event.code === 'ArrowUp' ? -1 : 1;
      suggestions.choose((chosen + step + offered.length) % offered.length);
    } else if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
      if (sent.length === 0) return;
      event.preventDefault();
      if (recall < 0) draft = field.value;
      recall = event.code === 'ArrowUp' ? (recall < 0 ? sent.length - 1 : Math.max(0, recall - 1)) : recall < 0 ? -1 : recall + 1;
      if (recall >= sent.length) recall = -1;
      field.value = recall < 0 ? draft : sent[recall]!;
      // A line walked back to is not asked about until it is typed into.
      suggestions.dismissed = true;
      suggestions.refresh();
    }
  }, { signal });

  return {
    resetRecall() {
      recall = -1;
    },
  };
}
