'use client';

// Shrink a photo/screenshot in the browser to a JPEG data URL small enough to store
// (the API accepts up to ~400 KB). Transfer screenshots stay readable at ~1000px.
export function resizeImage(file, maxSide = 1000, maxChars = 380000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; // PNG transparency -> white, not black
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      let q = 0.8;
      let out = canvas.toDataURL('image/jpeg', q);
      while (out.length > maxChars && q > 0.3) {
        q -= 0.15;
        out = canvas.toDataURL('image/jpeg', q);
      }
      if (out.length > maxChars) reject(new Error('too_large'));
      else resolve(out);
    };
    img.onerror = () => reject(new Error('not_image'));
    img.src = URL.createObjectURL(file);
  });
}
