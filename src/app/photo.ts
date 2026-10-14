import type { App } from './context.ts';

/**
 * Saves the canvas as a PNG named for where it was taken. Called in the same
 * task as the draw, before the browser clears the buffer, so no
 * `preserveDrawingBuffer` is needed. The country names are HTML over the
 * canvas, so they are painted into the copy.
 */
export function savePhoto(app: App, canvas: HTMLCanvasElement): void {
  const place = app.places.nearest(app.player.position).place.name;
  const slug = place.normalize('NFD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'somewhere';
  const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
  const photo = document.createElement('canvas');
  photo.width = canvas.width;
  photo.height = canvas.height;
  const context = photo.getContext('2d');
  if (context === null) {
    app.announce('The photo could not be saved', 'camera');
    return;
  }
  context.drawImage(canvas, 0, 0);
  app.names.drawTo(context, canvas.width / innerWidth);
  photo.toBlob((blob) => {
    if (blob === null) {
      app.announce('The photo could not be saved', 'camera');
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `atlas-${slug}-${stamp}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    app.announce('Photo saved', 'camera');
  }, 'image/png');
}
