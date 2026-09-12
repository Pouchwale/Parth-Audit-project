// A photo from a phone is several megabytes, and records live in the
// browser's storage (about 5 MB for everything — see DEPLOYMENT.md), so a
// photo is scaled down to at most 1024 px on its longer side and saved as a
// JPEG before it goes into a record: plenty for a complaint photograph, and
// roughly 60–150 KB.
const MAX_SIDE = 1024;
const QUALITY = 0.7;

/** Reads an image file and returns it as a scaled-down JPEG data URL. */
export function imageFileToDataUrl(file: File, maxSide = MAX_SIDE, quality = QUALITY): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Not an image"));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("No canvas");
        // A transparent PNG goes onto white, as it would print.
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch (e) {
        reject(e);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unreadable image"));
    };
    img.src = url;
  });
}
