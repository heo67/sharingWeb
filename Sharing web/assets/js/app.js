const appState = {
  maxLength: 1600,
  messages: {
    ready: "공유 링크와 QR 코드가 준비되었습니다.",
    empty: "공유할 텍스트가 아직 없습니다.",
    tooLong: "텍스트가 너무 길어 QR 코드로 만들기 어렵습니다. 내용을 조금 줄여 주세요.",
    copiedUrl: "URL을 복사했습니다.",
    copiedText: "텍스트를 복사했습니다.",
    copiedReaderText: "공유된 텍스트를 복사했습니다.",
    downloaded: "QR 이미지를 다운로드했습니다.",
  },
};

const elements = {
  reader: document.querySelector("#reader"),
  readerText: document.querySelector("#readerText"),
  readerStatus: document.querySelector("#readerStatus"),
  copyReaderButton: document.querySelector("#copyReaderButton"),
  editReaderButton: document.querySelector("#editReaderButton"),
  textInput: document.querySelector("#textInput"),
  shareUrl: document.querySelector("#shareUrl"),
  charCount: document.querySelector("#charCount"),
  urlSize: document.querySelector("#urlSize"),
  status: document.querySelector("#status"),
  canvas: document.querySelector("#qrCanvas"),
  emptyMessage: document.querySelector("#emptyMessage"),
  sharedText: document.querySelector("#sharedText"),
  networkNotice: document.querySelector("#networkNotice"),
  copyUrlButton: document.querySelector("#copyUrlButton"),
  copyTextButton: document.querySelector("#copyTextButton"),
  clearButton: document.querySelector("#clearButton"),
  downloadButton: document.querySelector("#downloadButton"),
  openShareButton: document.querySelector("#openShareButton"),
  currentYear: document.querySelector("#currentYear"),
};

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle("error", isError);
}

function setReaderStatus(message, isError = false) {
  elements.readerStatus.textContent = message;
  elements.readerStatus.classList.toggle("error", isError);
}

function createShareLink(text) {
  const url = new URL(window.location.pathname, window.location.origin);

  if (text.trim()) {
    url.searchParams.set("view", "text");
    url.searchParams.set("text", text);
  } else {
    url.searchParams.delete("view");
    url.searchParams.delete("text");
  }

  return url.toString();
}

function createEditorLink(text) {
  const url = new URL(window.location.pathname, window.location.origin);

  if (text.trim()) {
    url.searchParams.set("text", text);
  }

  return url.toString();
}

function isLocalOnlyHost() {
  return ["127.0.0.1", "localhost", "::1"].includes(window.location.hostname);
}

async function copyToClipboard(value, successMessage) {
  if (!value) return;

  try {
    await navigator.clipboard.writeText(value);
    setStatus(successMessage);
  } catch {
    if (elements.shareUrl) {
      elements.shareUrl.select();
      document.execCommand("copy");
      setStatus(successMessage);
    }
  }
}

async function copyReaderText(value) {
  if (!value) return;

  try {
    await navigator.clipboard.writeText(value);
    setReaderStatus(appState.messages.copiedReaderText);
  } catch {
    setReaderStatus("브라우저에서 복사를 허용하지 않았습니다. 텍스트를 직접 선택해 복사해 주세요.", true);
  }
}

function resetQrCanvas() {
  const context = elements.canvas.getContext("2d");
  context.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
}

function updateSharePreview(text, link) {
  const hasText = text.trim().length > 0;

  elements.shareUrl.value = link;
  elements.openShareButton.href = link;
  elements.charCount.textContent = `${text.length} / ${appState.maxLength}`;
  elements.urlSize.textContent = `${link.length.toLocaleString("ko-KR")}자 URL`;
  elements.sharedText.textContent = text || appState.messages.empty;
  elements.canvas.hidden = !hasText;
  elements.emptyMessage.hidden = hasText;
  elements.downloadButton.disabled = !hasText;
  elements.networkNotice.hidden = !hasText || !isLocalOnlyHost();

  return hasText;
}

function updateView() {
  const text = elements.textInput.value;
  const link = createShareLink(text);
  const hasText = updateSharePreview(text, link);

  window.history.replaceState(null, "", createEditorLink(text));

  if (!hasText) {
    resetQrCanvas();
    setStatus("");
    return;
  }

  try {
    window.TextQrCode.draw(elements.canvas, link);
    setStatus(appState.messages.ready);
  } catch {
    setStatus(appState.messages.tooLong, true);
  }
}

function renderReader(text) {
  document.body.classList.add("reader-mode");
  elements.reader.hidden = false;
  elements.readerText.textContent = text;
  elements.editReaderButton.href = createEditorLink("");
  document.title = "공유된 텍스트 - 텍스트 QR 공유";

  elements.copyReaderButton.addEventListener("click", () => {
    copyReaderText(text);
  });
}

function bindEvents() {
  elements.textInput.addEventListener("input", updateView);

  elements.copyUrlButton.addEventListener("click", () => {
    copyToClipboard(elements.shareUrl.value, appState.messages.copiedUrl);
  });

  elements.copyTextButton.addEventListener("click", () => {
    copyToClipboard(elements.textInput.value, appState.messages.copiedText);
  });

  elements.clearButton.addEventListener("click", () => {
    elements.textInput.value = "";
    elements.textInput.focus();
    updateView();
  });

  elements.downloadButton.addEventListener("click", () => {
    const link = document.createElement("a");
    link.download = "text-share-qr.png";
    link.href = elements.canvas.toDataURL("image/png");
    link.click();
    setStatus(appState.messages.downloaded);
  });
}

function init() {
  const params = new URLSearchParams(window.location.search);
  const sharedText = params.get("text") || "";
  const isReaderView = params.get("view") === "text" && sharedText.trim().length > 0;

  elements.currentYear.textContent = new Date().getFullYear();

  if (isReaderView) {
    renderReader(sharedText);
    return;
  }

  elements.textInput.maxLength = appState.maxLength;
  elements.textInput.value = sharedText;

  bindEvents();
  updateView();
}

document.addEventListener("DOMContentLoaded", init);
