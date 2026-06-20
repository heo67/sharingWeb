(function () {
  function draw(canvas, value) {
    const qr = make(value);
    const quiet = 4;
    const scale = 8;
    const canvasSize = (qr.size + quiet * 2) * scale;
    canvas.width = canvasSize;
    canvas.height = canvasSize;

    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvasSize, canvasSize);
    context.fillStyle = "#202124";

    for (let y = 0; y < qr.size; y += 1) {
      for (let x = 0; x < qr.size; x += 1) {
        if (qr.modules[y][x]) {
          context.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale);
        }
      }
    }
  }

  function make(value) {
    const bytes = new TextEncoder().encode(value);
    const ecl = 1;
    const totalCodewords = [
      -1, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346, 404, 466, 518, 581, 655, 733,
      815, 901, 991, 1085, 1156, 1258, 1364, 1474, 1588, 1706, 1828, 1921, 2051, 2185,
      2323, 2465, 2611, 2765, 2927, 3057, 3283, 3517, 3669, 3909,
    ];
    const eccCodewords = [
      -1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30,
      28, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
      30, 30, 30,
    ];
    const eccBlocks = [
      -1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9,
      10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25,
    ];

    let version = 1;
    let dataCapacity = 0;

    for (; version <= 40; version += 1) {
      dataCapacity = totalCodewords[version] - eccCodewords[version] * eccBlocks[version];
      const countBits = version < 10 ? 8 : 16;
      const neededBits = 4 + countBits + bytes.length * 8;
      if (bytes.length < 1 << countBits && neededBits <= dataCapacity * 8) break;
    }

    if (version > 40) {
      throw new Error("Text too long");
    }

    const bits = [];
    appendBits(bits, 0b0100, 4);
    appendBits(bits, bytes.length, version < 10 ? 8 : 16);
    bytes.forEach((byte) => appendBits(bits, byte, 8));

    const dataBits = dataCapacity * 8;
    appendBits(bits, 0, Math.min(4, dataBits - bits.length));
    while (bits.length % 8 !== 0) appendBits(bits, 0, 1);

    const data = [];
    for (let i = 0; i < bits.length; i += 8) {
      data.push(bits.slice(i, i + 8).reduce((sum, bit) => (sum << 1) | bit, 0));
    }

    for (let pad = 0xec; data.length < dataCapacity; pad ^= 0xfd) {
      data.push(pad);
    }

    const codewords = addErrorCorrection(data, version, totalCodewords, eccCodewords, eccBlocks);
    const size = version * 4 + 17;
    const modules = Array.from({ length: size }, () => Array(size).fill(false));
    const isFunction = Array.from({ length: size }, () => Array(size).fill(false));

    const setModule = (x, y, dark, functional = true) => {
      if (x < 0 || y < 0 || x >= size || y >= size) return;
      modules[y][x] = dark;
      isFunction[y][x] = functional;
    };

    drawFunctionPatterns(version, size, setModule);
    drawCodewords(codewords, modules, isFunction, size);

    const mask = 0;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (!isFunction[y][x] && (x + y) % 2 === 0) {
          modules[y][x] = !modules[y][x];
        }
      }
    }

    drawFormatBits(size, setModule, ecl, mask);
    if (version >= 7) drawVersionBits(version, size, setModule);

    return { modules, size };
  }

  function appendBits(bits, value, length) {
    for (let i = length - 1; i >= 0; i -= 1) {
      bits.push((value >>> i) & 1);
    }
  }

  function addErrorCorrection(data, version, totalCodewords, eccCodewords, eccBlocks) {
    const blockCount = eccBlocks[version];
    const eccLength = eccCodewords[version];
    const rawCodewords = totalCodewords[version];
    const shortBlockCount = blockCount - (rawCodewords % blockCount);
    const shortBlockLength = Math.floor(rawCodewords / blockCount);
    const generator = reedSolomonGenerator(eccLength);
    const blocks = [];
    let offset = 0;

    for (let blockIndex = 0; blockIndex < blockCount; blockIndex += 1) {
      const dataLength = shortBlockLength - eccLength + (blockIndex < shortBlockCount ? 0 : 1);
      const blockData = data.slice(offset, offset + dataLength);
      offset += dataLength;
      const ecc = reedSolomonRemainder(blockData, generator);
      if (blockIndex < shortBlockCount) blockData.push(0);
      blocks.push(blockData.concat(ecc));
    }

    const result = [];
    for (let i = 0; i < blocks[0].length; i += 1) {
      blocks.forEach((block, blockIndex) => {
        if (i !== shortBlockLength - eccLength || blockIndex >= shortBlockCount) {
          result.push(block[i]);
        }
      });
    }
    return result;
  }

  function reedSolomonGenerator(degree) {
    const result = Array(degree).fill(0);
    result[degree - 1] = 1;
    let root = 1;

    for (let i = 0; i < degree; i += 1) {
      for (let j = 0; j < degree; j += 1) {
        result[j] = gfMultiply(result[j], root);
        if (j + 1 < degree) result[j] ^= result[j + 1];
      }
      root = gfMultiply(root, 0x02);
    }

    return result;
  }

  function reedSolomonRemainder(data, generator) {
    const result = Array(generator.length).fill(0);
    data.forEach((byte) => {
      const factor = byte ^ result.shift();
      result.push(0);
      generator.forEach((coefficient, index) => {
        result[index] ^= gfMultiply(coefficient, factor);
      });
    });
    return result;
  }

  function gfMultiply(x, y) {
    let result = 0;
    for (let i = 7; i >= 0; i -= 1) {
      result = (result << 1) ^ ((result >>> 7) * 0x11d);
      if ((y >>> i) & 1) result ^= x;
    }
    return result & 0xff;
  }

  function drawFunctionPatterns(version, size, setModule) {
    drawFinderPattern(3, 3, setModule);
    drawFinderPattern(size - 4, 3, setModule);
    drawFinderPattern(3, size - 4, setModule);

    for (let i = 0; i < size; i += 1) {
      setModule(6, i, i % 2 === 0);
      setModule(i, 6, i % 2 === 0);
    }

    const alignmentPositions = getAlignmentPositions(version, size);
    alignmentPositions.forEach((x) => {
      alignmentPositions.forEach((y) => {
        const nearFinder =
          (x === 6 && y === 6) || (x === 6 && y === size - 7) || (x === size - 7 && y === 6);
        if (!nearFinder) drawAlignmentPattern(x, y, setModule);
      });
    });

    drawFormatBits(size, setModule, 1, 0);
    setModule(8, size - 8, true);
    if (version >= 7) drawVersionBits(version, size, setModule);
  }

  function drawFinderPattern(centerX, centerY, setModule) {
    for (let y = -4; y <= 4; y += 1) {
      for (let x = -4; x <= 4; x += 1) {
        const distance = Math.max(Math.abs(x), Math.abs(y));
        const dark = distance !== 2 && distance !== 4;
        setModule(centerX + x, centerY + y, dark);
      }
    }
  }

  function drawAlignmentPattern(centerX, centerY, setModule) {
    for (let y = -2; y <= 2; y += 1) {
      for (let x = -2; x <= 2; x += 1) {
        setModule(centerX + x, centerY + y, Math.max(Math.abs(x), Math.abs(y)) !== 1);
      }
    }
  }

  function getAlignmentPositions(version, size) {
    if (version === 1) return [];
    const count = Math.floor(version / 7) + 2;
    const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
    const result = [6];
    for (let position = size - 7; result.length < count; position -= step) {
      result.splice(1, 0, position);
    }
    return result;
  }

  function drawCodewords(codewords, modules, isFunction, size) {
    let bitIndex = 0;

    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;

      for (let vertical = 0; vertical < size; vertical += 1) {
        for (let column = 0; column < 2; column += 1) {
          const x = right - column;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vertical : vertical;

          if (!isFunction[y][x] && bitIndex < codewords.length * 8) {
            modules[y][x] = ((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) === 1;
            bitIndex += 1;
          }
        }
      }
    }
  }

  function drawFormatBits(size, setModule, ecl, mask) {
    const data = (ecl << 3) | mask;
    let remainder = data;
    for (let i = 0; i < 10; i += 1) {
      remainder = (remainder << 1) ^ (((remainder >>> 9) & 1) * 0x537);
    }
    const bits = ((data << 10) | remainder) ^ 0x5412;

    for (let i = 0; i <= 14; i += 1) {
      const dark = ((bits >>> i) & 1) === 1;

      if (i < 6) setModule(8, i, dark);
      else if (i < 8) setModule(8, i + 1, dark);
      else setModule(8, size - 15 + i, dark);

      if (i < 8) setModule(size - i - 1, 8, dark);
      else if (i < 9) setModule(15 - i, 8, dark);
      else setModule(14 - i, 8, dark);
    }
    setModule(8, size - 8, true);
  }

  function drawVersionBits(version, size, setModule) {
    let remainder = version;
    for (let i = 0; i < 12; i += 1) {
      remainder = (remainder << 1) ^ (((remainder >>> 11) & 1) * 0x1f25);
    }
    const bits = (version << 12) | remainder;

    for (let i = 0; i < 18; i += 1) {
      const dark = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setModule(a, b, dark);
      setModule(b, a, dark);
    }
  }

  window.TextQrCode = { draw };
})();
