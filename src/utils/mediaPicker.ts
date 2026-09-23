// Universal media picker and compressor for Web, Android, iOS, and Desktop

export async function pickMedia(maxDim = 800, quality = 0.85): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,image/*,video/*';
    input.style.display = 'none';

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }

      const isVideo = file.type.startsWith('video/') || 
                      file.name.toLowerCase().endsWith('.mp4') || 
                      file.name.toLowerCase().endsWith('.webm');
      const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');

      // 1. Video files: limit size to 5MB to prevent storage quota issues
      if (isVideo) {
        if (file.size > 5 * 1024 * 1024) {
          alert('Размер видеофайла слишком большой (максимум 5 МБ для обложки)');
          resolve(null);
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
        return;
      }

      // 2. GIF files: limit size to 4MB, keep animation intact
      if (isGif) {
        if (file.size > 4 * 1024 * 1024) {
          alert('Размер GIF-анимации слишком большой (максимум 4 МБ для обложки)');
          resolve(null);
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
        return;
      }

      // 3. Regular image files: resize and compress with canvas
      try {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            let width = img.width;
            let height = img.height;

            if (width > maxDim || height > maxDim) {
              if (width > height) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
              } else {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
              }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve(e.target?.result as string);
              return;
            }

            ctx.drawImage(img, 0, 0, width, height);
            const format = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
            const dataUrl = canvas.toDataURL(format, quality);
            resolve(dataUrl);
          };
          img.onerror = () => resolve(e.target?.result as string);
          img.src = e.target?.result as string;
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      } catch (err) {
        console.error('Error optimizing image:', err);
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      }
    };

    input.oncancel = () => resolve(null);
    document.body.appendChild(input);
    input.click();
    setTimeout(() => {
      if (document.body.contains(input)) {
        document.body.removeChild(input);
      }
    }, 60000);
  });
}

export const pickImage = pickMedia;
export const pickMediaFile = pickMedia;
