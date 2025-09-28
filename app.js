const DOMINANT_COLOR_COUNT = 5;
const MAX_PIXEL_SAMPLES = 6000;
const MAX_CANVAS_DIMENSION = 420;
const SIMILAR_PALETTES_TO_SHOW = 8;

const fileInput = document.getElementById('imageInput');
const imagePreview = document.getElementById('imagePreview');
const imageCanvas = document.getElementById('imageCanvas');
const dominantSection = document.getElementById('dominantColorsSection');
const dominantContainer = document.getElementById('dominantColors');
const paletteSection = document.getElementById('similarPalettesSection');
const paletteContainer = document.getElementById('similarPalettes');
const paletteTemplate = document.getElementById('paletteTemplate');

let palettes = [];

async function loadPalettes() {
  const response = await fetch('./palettes.json');
  if (!response.ok) {
    throw new Error(`Не удалось загрузить палетки: ${response.status}`);
  }
  palettes = await response.json();
}

function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve({ img, url: reader.result });
      img.onerror = () => reject(new Error('Не удалось прочитать изображение'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Ошибка чтения файла'));
    reader.readAsDataURL(file);
  });
}

function drawImageToCanvas(image) {
  const { img } = image;
  const scale = Math.min(1, MAX_CANVAS_DIMENSION / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  imageCanvas.width = width;
  imageCanvas.height = height;
  const ctx = imageCanvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  return { ctx, imageData };
}

function getPixelSamples(imageData) {
  const { data } = imageData;
  const pixels = [];
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha === 0) continue;
    const pixel = [data[i], data[i + 1], data[i + 2]];
    pixels.push(pixel);
  }

  if (pixels.length <= MAX_PIXEL_SAMPLES) {
    return pixels;
  }

  const sampled = [];
  for (let i = 0; i < MAX_PIXEL_SAMPLES; i += 1) {
    const index = Math.floor(Math.random() * pixels.length);
    sampled.push(pixels[index]);
  }
  return sampled;
}

function pickInitialCentroids(pixels, k) {
  const centroids = [];
  const used = new Set();
  while (centroids.length < k && used.size < pixels.length) {
    const index = Math.floor(Math.random() * pixels.length);
    if (used.has(index)) continue;
    used.add(index);
    centroids.push(pixels[index].slice());
  }
  return centroids;
}

function squaredDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return sum;
}

function kMeans(pixels, k, maxIterations = 12) {
  if (pixels.length === 0) return [];
  if (pixels.length <= k) return pixels.slice(0, k);

  let centroids = pickInitialCentroids(pixels, k);
  if (centroids.length === 0) {
    centroids = [pixels[0].slice()];
  }
  while (centroids.length < k) {
    const fallback = pixels[Math.floor(Math.random() * pixels.length)].slice();
    centroids.push(fallback);
  }
  let assignments = new Array(pixels.length).fill(0);

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let changed = false;

    for (let i = 0; i < pixels.length; i += 1) {
      const pixel = pixels[i];
      let bestIndex = 0;
      let bestDistance = squaredDistance(pixel, centroids[0]);

      for (let j = 1; j < centroids.length; j += 1) {
        const distance = squaredDistance(pixel, centroids[j]);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = j;
        }
      }

      if (assignments[i] !== bestIndex) {
        assignments[i] = bestIndex;
        changed = true;
      }
    }

    const sums = centroids.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < pixels.length; i += 1) {
      const centroidIndex = assignments[i];
      const pixel = pixels[i];
      const accumulator = sums[centroidIndex];
      accumulator[0] += pixel[0];
      accumulator[1] += pixel[1];
      accumulator[2] += pixel[2];
      accumulator[3] += 1;
    }

    for (let j = 0; j < centroids.length; j += 1) {
      const accumulator = sums[j];
      if (accumulator[3] === 0) continue;
      centroids[j] = [
        accumulator[0] / accumulator[3],
        accumulator[1] / accumulator[3],
        accumulator[2] / accumulator[3],
      ];
    }

    if (!changed) break;
  }

  return centroids
    .map((centroid) => centroid.map((value) => Math.round(value)))
    .slice(0, k);
}

function rgbToHex([r, g, b]) {
  return `#${[r, g, b]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

function rgbToLab([r, g, b]) {
  const sr = r / 255;
  const sg = g / 255;
  const sb = b / 255;

  const linearize = (value) =>
    value > 0.04045 ? ((value + 0.055) / 1.055) ** 2.4 : value / 12.92;

  const R = linearize(sr);
  const G = linearize(sg);
  const B = linearize(sb);

  const X = R * 0.4124 + G * 0.3576 + B * 0.1805;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = R * 0.0193 + G * 0.1192 + B * 0.9505;

  const refX = 0.95047;
  const refY = 1.0;
  const refZ = 1.08883;

  const normalize = (value) => {
    const v = value > 0.008856 ? value ** (1 / 3) : 7.787 * value + 16 / 116;
    return v;
  };

  const fx = normalize(X / refX);
  const fy = normalize(Y / refY);
  const fz = normalize(Z / refZ);

  const L = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const bVal = 200 * (fy - fz);

  return { L, a, b: bVal };
}

function paletteDistance(imageLab, paletteLab) {
  let total = 0;
  for (const target of paletteLab) {
    let minDistance = Infinity;
    for (const source of imageLab) {
      const distance = Math.sqrt(
        (target.L - source.L) ** 2 +
          (target.a - source.a) ** 2 +
          (target.b - source.b) ** 2,
      );
      if (distance < minDistance) {
        minDistance = distance;
      }
    }
    total += minDistance;
  }
  return total / paletteLab.length;
}

function renderDominantColors(colors) {
  dominantContainer.innerHTML = '';
  colors.forEach((color) => {
    const swatch = document.createElement('div');
    swatch.className = 'swatch';

    const colorBlock = document.createElement('div');
    colorBlock.className = 'swatch__color';
    colorBlock.style.background = color.hex;

    const label = document.createElement('div');
    label.className = 'swatch__label';
    label.textContent = color.hex;

    swatch.append(colorBlock, label);
    dominantContainer.appendChild(swatch);
  });

  dominantSection.hidden = false;
}

function renderPalettes(similarPalettes) {
  paletteContainer.innerHTML = '';
  similarPalettes.forEach((item) => {
    const fragment = paletteTemplate.content.cloneNode(true);
    const colorsRoot = fragment.querySelector('[data-role="colors"]');
    const titleNode = fragment.querySelector('[data-role="title"]');
    const metaNode = fragment.querySelector('[data-role="meta"]');

    item.palette.colors.forEach((hex) => {
      const block = document.createElement('span');
      block.style.background = hex;
      colorsRoot.appendChild(block);
    });

    titleNode.textContent = item.palette.name;
    const distance = item.distance.toFixed(2);
    metaNode.textContent = `Расстояние в LAB: ${distance}`;

    paletteContainer.appendChild(fragment);
  });

  paletteSection.hidden = similarPalettes.length === 0;
}

async function handleFileSelected(event) {
  const [file] = event.target.files;
  if (!file) return;

  const image = await readImage(file);
  imagePreview.innerHTML = '';
  const imgNode = document.createElement('img');
  imgNode.src = image.url;
  imgNode.alt = file.name;
  imagePreview.appendChild(imgNode);

  const { imageData } = drawImageToCanvas(image);
  const samples = getPixelSamples(imageData);
  const centroids = kMeans(samples, DOMINANT_COLOR_COUNT);
  const colors = centroids.map((rgb) => ({
    rgb,
    hex: rgbToHex(rgb),
    lab: rgbToLab(rgb),
  }));

  renderDominantColors(colors);

  const imageLabColors = colors.map((color) => color.lab);

  const scoredPalettes = palettes
    .map((palette) => {
      const labColors = palette.colors.map((hex) => rgbToLab(hexToRgb(hex)));
      const distance = paletteDistance(imageLabColors, labColors);
      return { palette, distance };
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, SIMILAR_PALETTES_TO_SHOW);

  renderPalettes(scoredPalettes);
}

function hexToRgb(hex) {
  const normalized = hex.replace('#', '');
  const bigint = parseInt(normalized, 16);
  return [
    (bigint >> 16) & 255,
    (bigint >> 8) & 255,
    bigint & 255,
  ];
}

async function init() {
  try {
    await loadPalettes();
  } catch (error) {
    console.error(error);
    imagePreview.textContent = 'Не удалось загрузить палетки ColorHunt.';
    return;
  }

  fileInput.addEventListener('change', handleFileSelected);
}

init();