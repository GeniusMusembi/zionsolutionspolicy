// ---------- shared helpers ----------
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function setStatus(el, message, kind) {
  el.textContent = message;
  el.className = 'status' + (kind ? ' ' + kind : '');
}

function wireDropzone(dropzone, input) {
  dropzone.addEventListener('dragover', e => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', e => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    input.files = e.dataTransfer.files;
    input.dispatchEvent(new Event('change'));
  });
}

// ---------- library availability checks ----------
window.addEventListener('DOMContentLoaded', () => {
  if (typeof PDFLib === 'undefined') {
    document.getElementById('libWarningMerge').style.display = 'block';
  }
  if (typeof mammoth === 'undefined' || typeof html2pdf === 'undefined') {
    document.getElementById('libWarningWord').style.display = 'block';
  }
});

// ---------- PDF MERGER ----------
(function () {
  const input = document.getElementById('mergeInput');
  const dropzone = document.getElementById('mergeDropzone');
  const listEl = document.getElementById('mergeFileList');
  const mergeBtn = document.getElementById('mergeBtn');
  const statusEl = document.getElementById('mergeStatus');

  let files = [];

  wireDropzone(dropzone, input);

  input.addEventListener('change', e => {
    const newFiles = Array.from(e.target.files || []).filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    files = files.concat(newFiles);
    input.value = '';
    render();
  });

  function render() {
    listEl.innerHTML = '';
    files.forEach((file, idx) => {
      const li = document.createElement('li');

      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = `${idx + 1}. ${file.name}`;
      li.appendChild(name);

      const actions = document.createElement('span');
      actions.className = 'actions';

      const upBtn = document.createElement('button');
      upBtn.className = 'icon-btn';
      upBtn.textContent = '↑';
      upBtn.title = 'Move up';
      upBtn.disabled = idx === 0;
      upBtn.addEventListener('click', () => {
        [files[idx - 1], files[idx]] = [files[idx], files[idx - 1]];
        render();
      });

      const downBtn = document.createElement('button');
      downBtn.className = 'icon-btn';
      downBtn.textContent = '↓';
      downBtn.title = 'Move down';
      downBtn.disabled = idx === files.length - 1;
      downBtn.addEventListener('click', () => {
        [files[idx + 1], files[idx]] = [files[idx], files[idx + 1]];
        render();
      });

      const removeBtn = document.createElement('button');
      removeBtn.className = 'icon-btn';
      removeBtn.textContent = '✕';
      removeBtn.title = 'Remove';
      removeBtn.addEventListener('click', () => {
        files.splice(idx, 1);
        render();
      });

      actions.appendChild(upBtn);
      actions.appendChild(downBtn);
      actions.appendChild(removeBtn);
      li.appendChild(actions);

      listEl.appendChild(li);
    });

    mergeBtn.disabled = files.length < 2;
    setStatus(statusEl, files.length === 0 ? '' : `${files.length} file(s) selected.`);
  }

  mergeBtn.addEventListener('click', async () => {
    if (typeof PDFLib === 'undefined') {
      setStatus(statusEl, 'PDF engine not loaded. Check your internet connection.', 'error');
      return;
    }
    mergeBtn.disabled = true;
    setStatus(statusEl, 'Merging…');
    try {
      const { PDFDocument } = PDFLib;
      const mergedPdf = await PDFDocument.create();
      for (const file of files) {
        let src;
        try {
          const bytes = await file.arrayBuffer();
          src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        } catch (err) {
          throw new Error(`Couldn't read "${file.name}" — it may be corrupted or in an unsupported format.`);
        }
        if (src.isEncrypted) {
          throw new Error(`"${file.name}" is password-protected or restricted, so it can't be merged directly. Open it, use your PDF viewer's "Print to PDF" (or an unlock tool) to save an unprotected copy, then try merging that copy.`);
        }
        try {
          const pages = await mergedPdf.copyPages(src, src.getPageIndices());
          pages.forEach(p => mergedPdf.addPage(p));
        } catch (err) {
          throw new Error(`Couldn't copy pages from "${file.name}" — it may use unsupported PDF features. Try re-saving it (e.g. "Print to PDF") and merge that copy instead.`);
        }
      }
      const mergedBytes = await mergedPdf.save();
      downloadBlob(new Blob([mergedBytes], { type: 'application/pdf' }), 'merged.pdf');
      setStatus(statusEl, 'Done — merged.pdf downloaded.', 'success');
    } catch (err) {
      setStatus(statusEl, 'Error: ' + err.message, 'error');
    } finally {
      mergeBtn.disabled = files.length < 2;
    }
  });
})();

// ---------- WORD TO PDF ----------
(function () {
  const input = document.getElementById('wordInput');
  const dropzone = document.getElementById('wordDropzone');
  const label = document.getElementById('wordFileLabel');
  const btn = document.getElementById('wordToPdfBtn');
  const statusEl = document.getElementById('wordStatus');

  let currentFile = null;

  wireDropzone(dropzone, input);

  input.addEventListener('change', e => {
    currentFile = e.target.files[0] || null;
    label.textContent = currentFile ? currentFile.name : 'Click to choose a .docx file, or drag it here';
    btn.disabled = !currentFile;
    setStatus(statusEl, '');
  });

  btn.addEventListener('click', async () => {
    if (!currentFile) return;
    if (typeof mammoth === 'undefined' || typeof html2pdf === 'undefined') {
      setStatus(statusEl, 'Conversion engine not loaded. Check your internet connection.', 'error');
      return;
    }
    btn.disabled = true;
    setStatus(statusEl, 'Converting…');
    let container = null;
    try {
      const arrayBuffer = await currentFile.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer });

      container = document.createElement('div');
      container.innerHTML = result.value;
      container.style.position = 'fixed';
      container.style.left = '-10000px';
      container.style.top = '0';
      container.style.width = '700px';
      container.style.padding = '30px';
      container.style.background = '#ffffff';
      container.style.color = '#111111';
      container.style.fontFamily = 'Georgia, "Times New Roman", serif';
      container.style.fontSize = '14px';
      container.style.lineHeight = '1.5';
      document.body.appendChild(container);

      const outName = currentFile.name.replace(/\.docx$/i, '') + '.pdf';

      await html2pdf()
        .set({
          filename: outName,
          margin: 12,
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'pt', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'] }
        })
        .from(container)
        .save();

      setStatus(statusEl, `Done — ${outName} downloaded.`, 'success');
      if (result.messages && result.messages.length) {
        console.log('mammoth conversion messages:', result.messages);
      }
    } catch (err) {
      setStatus(statusEl, 'Error: ' + err.message, 'error');
    } finally {
      if (container && container.parentNode) container.parentNode.removeChild(container);
      btn.disabled = false;
    }
  });
})();
