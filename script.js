const storageKey = "ai-prompt-library-prompts";
const form = document.getElementById("prompt-form");
const titleInput = document.getElementById("prompt-title");
const modelInput = document.getElementById("prompt-model");
const contentInput = document.getElementById("prompt-content");
const promptList = document.getElementById("prompt-list");
const promptCount = document.getElementById("prompt-count");
const exportButton = document.getElementById("export-button");
const importButton = document.getElementById("import-button");
const importFileInput = document.getElementById("import-file-input");
const exportSchemaVersion = "1.0.0";
const importBackupKey = "ai-prompt-library-import-backup";

// Creates a valid ISO timestamp string for metadata records.
function createIsoTimestamp() {
  return new Date().toISOString();
}

// Checks whether a string is a strict ISO 8601 timestamp.
function isIsoTimestamp(value) {
  if (typeof value !== "string") {
    return false;
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return false;
  }

  return parsedDate.toISOString() === value;
}

// Detects whether prompt content looks like code for token estimation.
function looksLikeCode(text) {
  return /```|^\s*(?:function|class|const|let|var|import|export|def|return|if|for|while)\b/m.test(
    text,
  );
}

// Validates and estimates prompt tokens from content.
function estimateTokens(text, isCode) {
  if (typeof text !== "string") {
    throw new Error("Prompt content must be a string.");
  }

  if (typeof isCode !== "boolean") {
    throw new Error("isCode must be a boolean value.");
  }

  const normalizedText = text.trim();
  const wordCount = normalizedText ? normalizedText.split(/\s+/).length : 0;
  const characterCount = text.length;
  const multiplier = isCode ? 1.3 : 1;
  const min = Math.round(0.75 * wordCount * multiplier);
  const max = Math.round(0.25 * characterCount * multiplier);
  const estimatedTokens = Math.max(min, max);

  let confidence = "high";

  if (estimatedTokens > 5000) {
    confidence = "low";
  } else if (estimatedTokens >= 1000) {
    confidence = "medium";
  }

  return { min, max, confidence };
}

// Builds a metadata object for a prompt and validates its inputs.
function trackModel(modelName, content) {
  if (typeof modelName !== "string") {
    throw new Error("Model name must be a string.");
  }

  const normalizedModel = modelName.trim();

  if (!normalizedModel) {
    throw new Error("Model name cannot be empty.");
  }

  if (normalizedModel.length > 100) {
    throw new Error("Model name must be 100 characters or fewer.");
  }

  if (typeof content !== "string") {
    throw new Error("Prompt content must be a string.");
  }

  const createdAt = createIsoTimestamp();

  return {
    model: normalizedModel,
    createdAt,
    updatedAt: createdAt,
    tokenEstimate: estimateTokens(content, looksLikeCode(content)),
  };
}

// Updates the metadata timestamp while keeping it chronologically valid.
function updateTimestamps(metadata) {
  if (!metadata || typeof metadata !== "object") {
    throw new Error("Metadata must be an object.");
  }

  if (typeof metadata.model !== "string" || !metadata.model.trim()) {
    throw new Error("Metadata model must be a non-empty string.");
  }

  if (!isIsoTimestamp(metadata.createdAt)) {
    throw new Error("Metadata createdAt must be a valid ISO 8601 timestamp.");
  }

  const updatedAt = createIsoTimestamp();

  if (Date.parse(updatedAt) < Date.parse(metadata.createdAt)) {
    throw new Error("updatedAt must be greater than or equal to createdAt.");
  }

  return {
    ...metadata,
    updatedAt,
  };
}

// Normalizes token estimates so loaded prompts stay renderable.
function normalizeTokenEstimate(tokenEstimate, content) {
  if (
    tokenEstimate &&
    typeof tokenEstimate === "object" &&
    Number.isFinite(tokenEstimate.min) &&
    Number.isFinite(tokenEstimate.max) &&
    ["high", "medium", "low"].includes(tokenEstimate.confidence)
  ) {
    return {
      min: tokenEstimate.min,
      max: tokenEstimate.max,
      confidence: tokenEstimate.confidence,
    };
  }

  return estimateTokens(content, looksLikeCode(content));
}

// Normalizes metadata for older saved prompts before rendering.
function normalizeMetadata(prompt) {
  const content = typeof prompt.content === "string" ? prompt.content : "";
  const existingMetadata =
    prompt.metadata && typeof prompt.metadata === "object"
      ? prompt.metadata
      : {};
  const model =
    typeof existingMetadata.model === "string" && existingMetadata.model.trim()
      ? existingMetadata.model.trim().slice(0, 100)
      : "Unknown model";
  const createdAt = isIsoTimestamp(existingMetadata.createdAt)
    ? existingMetadata.createdAt
    : "1970-01-01T00:00:00.000Z";
  const updatedAt = isIsoTimestamp(existingMetadata.updatedAt)
    ? existingMetadata.updatedAt
    : createdAt;

  return {
    model,
    createdAt,
    updatedAt:
      Date.parse(updatedAt) < Date.parse(createdAt) ? createdAt : updatedAt,
    tokenEstimate: normalizeTokenEstimate(
      existingMetadata.tokenEstimate,
      content,
    ),
  };
}

// Formats ISO timestamps for display in the prompt cards.
function formatTimestamp(timestamp) {
  if (!isIsoTimestamp(timestamp)) {
    return "Unknown";
  }

  return new Date(timestamp).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// Normalizes stored prompt data before rendering.
function normalizePrompt(prompt) {
  return {
    ...prompt,
    rating: Number.isInteger(prompt.rating) ? prompt.rating : 0,
    metadata: normalizeMetadata(prompt),
    notes: Array.isArray(prompt.notes)
      ? prompt.notes.map((note) => ({
          id: note.id,
          text: typeof note.text === "string" ? note.text : "",
          createdAt: Number.isFinite(note.createdAt)
            ? note.createdAt
            : Date.now(),
          updatedAt: Number.isFinite(note.updatedAt)
            ? note.updatedAt
            : Date.now(),
        }))
      : [],
  };
}

// Loads prompts from localStorage and safely normalizes them.
function loadPrompts() {
  const storedPrompts = localStorage.getItem(storageKey);

  try {
    const prompts = storedPrompts ? JSON.parse(storedPrompts) : [];

    return Array.isArray(prompts) ? prompts.map(normalizePrompt) : [];
  } catch {
    return [];
  }
}

// Saves prompts to localStorage and reports storage failures.
function savePrompts(prompts) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(prompts));
    return true;
  } catch {
    return false;
  }
}

// Checks whether a token estimate object follows the expected shape.
function isValidTokenEstimate(tokenEstimate) {
  if (!tokenEstimate || typeof tokenEstimate !== "object") {
    return false;
  }

  if (
    !Number.isFinite(tokenEstimate.min) ||
    !Number.isFinite(tokenEstimate.max)
  ) {
    return false;
  }

  return ["high", "medium", "low"].includes(tokenEstimate.confidence);
}

// Validates one prompt record and returns a safe normalized copy.
function validatePromptRecord(prompt, index) {
  if (!prompt || typeof prompt !== "object") {
    throw new Error(`Prompt at index ${index} is not a valid object.`);
  }

  if (typeof prompt.id !== "string" || !prompt.id.trim()) {
    throw new Error(`Prompt at index ${index} is missing a valid id.`);
  }

  if (typeof prompt.title !== "string" || !prompt.title.trim()) {
    throw new Error(`Prompt ${prompt.id} is missing a valid title.`);
  }

  if (typeof prompt.content !== "string" || !prompt.content.trim()) {
    throw new Error(`Prompt ${prompt.id} is missing valid content.`);
  }

  if (
    !Number.isInteger(prompt.rating) ||
    prompt.rating < 0 ||
    prompt.rating > 5
  ) {
    throw new Error(`Prompt ${prompt.id} has an invalid rating.`);
  }

  if (!Array.isArray(prompt.notes)) {
    throw new Error(`Prompt ${prompt.id} has invalid notes.`);
  }

  const normalizedNotes = prompt.notes.map((note, noteIndex) => {
    if (!note || typeof note !== "object") {
      throw new Error(
        `Prompt ${prompt.id} has an invalid note at index ${noteIndex}.`,
      );
    }

    if (typeof note.id !== "string" || !note.id.trim()) {
      throw new Error(`Prompt ${prompt.id} has a note with invalid id.`);
    }

    if (typeof note.text !== "string") {
      throw new Error(`Prompt ${prompt.id} has a note with invalid text.`);
    }

    if (!Number.isFinite(note.createdAt) || !Number.isFinite(note.updatedAt)) {
      throw new Error(
        `Prompt ${prompt.id} has a note with invalid timestamps.`,
      );
    }

    if (note.updatedAt < note.createdAt) {
      throw new Error(
        `Prompt ${prompt.id} has a note with inconsistent timestamps.`,
      );
    }

    return {
      id: note.id,
      text: note.text,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    };
  });

  const metadata = prompt.metadata;

  if (!metadata || typeof metadata !== "object") {
    throw new Error(`Prompt ${prompt.id} is missing metadata.`);
  }

  if (typeof metadata.model !== "string" || !metadata.model.trim()) {
    throw new Error(`Prompt ${prompt.id} has invalid metadata.model.`);
  }

  if (
    !isIsoTimestamp(metadata.createdAt) ||
    !isIsoTimestamp(metadata.updatedAt)
  ) {
    throw new Error(`Prompt ${prompt.id} has invalid metadata timestamps.`);
  }

  if (Date.parse(metadata.updatedAt) < Date.parse(metadata.createdAt)) {
    throw new Error(
      `Prompt ${prompt.id} has metadata.updatedAt before metadata.createdAt.`,
    );
  }

  if (!isValidTokenEstimate(metadata.tokenEstimate)) {
    throw new Error(`Prompt ${prompt.id} has invalid metadata token estimate.`);
  }

  return {
    id: prompt.id,
    title: prompt.title.trim(),
    content: prompt.content,
    rating: prompt.rating,
    notes: normalizedNotes,
    metadata: {
      model: metadata.model.trim().slice(0, 100),
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
      tokenEstimate: {
        min: metadata.tokenEstimate.min,
        max: metadata.tokenEstimate.max,
        confidence: metadata.tokenEstimate.confidence,
      },
    },
  };
}

// Validates a prompt array and enforces unique ids.
function validatePromptCollection(prompts) {
  if (!Array.isArray(prompts)) {
    throw new Error("Prompts data must be an array.");
  }

  const seenIds = new Set();

  return prompts.map((prompt, index) => {
    const validPrompt = validatePromptRecord(prompt, index);

    if (seenIds.has(validPrompt.id)) {
      throw new Error(`Duplicate prompt id found: ${validPrompt.id}.`);
    }

    seenIds.add(validPrompt.id);
    return validPrompt;
  });
}

// Builds export statistics used by the transfer schema.
function buildExportStatistics(prompts) {
  const totalPrompts = prompts.length;
  const totalRating = prompts.reduce((sum, prompt) => sum + prompt.rating, 0);
  const averageRating = totalPrompts
    ? Number((totalRating / totalPrompts).toFixed(2))
    : 0;

  const usageByModel = new Map();

  prompts.forEach((prompt) => {
    const model = prompt.metadata.model;
    usageByModel.set(model, (usageByModel.get(model) || 0) + 1);
  });

  let mostUsedModel = "N/A";
  let highestCount = 0;

  usageByModel.forEach((count, model) => {
    if (count > highestCount) {
      highestCount = count;
      mostUsedModel = model;
    }
  });

  return {
    totalPrompts,
    averageRating,
    mostUsedModel,
  };
}

// Converts ISO timestamps into a filename-safe stamp.
function createFileStamp() {
  return createIsoTimestamp().replace(/[:.]/g, "-");
}

// Validates export metadata fields for imported files.
function validateExportStatistics(statistics) {
  if (!statistics || typeof statistics !== "object") {
    throw new Error("Import file has invalid statistics metadata.");
  }

  if (
    !Number.isFinite(statistics.totalPrompts) ||
    statistics.totalPrompts < 0
  ) {
    throw new Error("Import file has invalid statistics.totalPrompts.");
  }

  if (!Number.isFinite(statistics.averageRating)) {
    throw new Error("Import file has invalid statistics.averageRating.");
  }

  if (typeof statistics.mostUsedModel !== "string") {
    throw new Error("Import file has invalid statistics.mostUsedModel.");
  }
}

// Checks schema version compatibility for imports.
function isSupportedImportVersion(version) {
  if (typeof version !== "string") {
    return false;
  }

  const [major] = version.split(".");
  return Number.parseInt(major, 10) === 1;
}

// Parses and validates an import file payload against the schema.
function parseImportPayload(fileContent) {
  let payload;

  try {
    payload = JSON.parse(fileContent);
  } catch {
    throw new Error("Import file is not valid JSON.");
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("Import file must contain an object at the root.");
  }

  if (!isSupportedImportVersion(payload.version)) {
    throw new Error(
      `Unsupported import version: ${String(payload.version)}. Expected major version 1.`,
    );
  }

  if (!isIsoTimestamp(payload.exportedAt)) {
    throw new Error("Import file has invalid exportedAt timestamp.");
  }

  validateExportStatistics(payload.statistics);
  const prompts = validatePromptCollection(payload.prompts);

  if (payload.statistics.totalPrompts !== prompts.length) {
    throw new Error(
      "Import file statistics do not match prompt count. The file may be corrupted.",
    );
  }

  return {
    version: payload.version,
    exportedAt: payload.exportedAt,
    statistics: payload.statistics,
    prompts,
  };
}

// Creates a restorable backup snapshot before an import operation.
function storeImportBackup(rawExistingData) {
  try {
    localStorage.setItem(
      importBackupKey,
      JSON.stringify({
        createdAt: createIsoTimestamp(),
        storageKey,
        data: rawExistingData,
      }),
    );
  } catch {
    // Ignore backup write failures and rely on in-memory rollback.
  }
}

// Restores localStorage to the pre-import snapshot after failure.
function rollbackImport(rawExistingData) {
  if (rawExistingData === null) {
    localStorage.removeItem(storageKey);
    return;
  }

  localStorage.setItem(storageKey, rawExistingData);
}

// Merges imported prompts with existing prompts based on conflict strategy.
function mergePromptsWithStrategy(existingPrompts, importedPrompts, strategy) {
  const existingMap = new Map(
    existingPrompts.map((prompt) => [prompt.id, prompt]),
  );
  const importedById = new Map(
    importedPrompts.map((prompt) => [prompt.id, prompt]),
  );
  const conflictingIds = importedPrompts
    .filter((prompt) => existingMap.has(prompt.id))
    .map((prompt) => prompt.id);

  if (conflictingIds.length === 0) {
    return [...existingPrompts, ...importedPrompts];
  }

  if (strategy === "keep-existing") {
    const nonConflictingImports = importedPrompts.filter(
      (prompt) => !existingMap.has(prompt.id),
    );
    return [...existingPrompts, ...nonConflictingImports];
  }

  if (strategy === "replace-existing") {
    const replaced = existingPrompts.map(
      (prompt) => importedById.get(prompt.id) || prompt,
    );
    const nonConflictingImports = importedPrompts.filter(
      (prompt) => !existingMap.has(prompt.id),
    );
    return [...replaced, ...nonConflictingImports];
  }

  if (strategy === "duplicate-imported") {
    const usedIds = new Set(existingPrompts.map((prompt) => prompt.id));
    const dedupedImports = importedPrompts.map((prompt) => {
      if (!usedIds.has(prompt.id)) {
        usedIds.add(prompt.id);
        return prompt;
      }

      let nextId = crypto.randomUUID();
      while (usedIds.has(nextId)) {
        nextId = crypto.randomUUID();
      }

      usedIds.add(nextId);
      return {
        ...prompt,
        id: nextId,
      };
    });

    return [...existingPrompts, ...dedupedImports];
  }

  throw new Error("Unknown merge strategy selected.");
}

// Asks the user how to resolve prompt id conflicts during merge mode.
function promptConflictStrategy(conflictCount) {
  const rawChoice = window.prompt(
    `${conflictCount} duplicate ID conflict(s) found. Choose one: keep-existing, replace-existing, duplicate-imported, or cancel.`,
    "keep-existing",
  );

  const choice =
    typeof rawChoice === "string" ? rawChoice.trim().toLowerCase() : "cancel";

  if (
    choice === "keep-existing" ||
    choice === "replace-existing" ||
    choice === "duplicate-imported"
  ) {
    return choice;
  }

  return "cancel";
}

// Builds a fully validated export payload for download.
function buildExportPayload() {
  const prompts = validatePromptCollection(loadPrompts());

  return {
    version: exportSchemaVersion,
    exportedAt: createIsoTimestamp(),
    statistics: buildExportStatistics(prompts),
    prompts,
  };
}

// Exports the prompt library as a timestamped JSON file.
function exportPrompts() {
  try {
    const payload = buildExportPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = downloadUrl;
    link.download = `ai-prompt-library-export-${createFileStamp()}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
  } catch (error) {
    window.alert(
      error instanceof Error
        ? `Export failed: ${error.message}`
        : "Export failed due to an unexpected error.",
    );
  }
}

// Imports prompts from schema-validated JSON with rollback on failure.
function importPromptsFromPayload(payload) {
  const existingRawData = localStorage.getItem(storageKey);
  const existingPrompts = validatePromptCollection(loadPrompts());

  storeImportBackup(existingRawData);

  try {
    const replaceAll =
      existingPrompts.length > 0
        ? window.confirm(
            "Import mode: click OK to replace all existing prompts, or Cancel to merge with existing prompts.",
          )
        : true;

    let nextPrompts = payload.prompts;

    if (!replaceAll) {
      const existingIds = new Set(existingPrompts.map((prompt) => prompt.id));
      const conflictCount = payload.prompts.filter((prompt) =>
        existingIds.has(prompt.id),
      ).length;

      if (conflictCount > 0) {
        const strategy = promptConflictStrategy(conflictCount);

        if (strategy === "cancel") {
          throw new Error(
            "Import canceled by user during conflict resolution.",
          );
        }

        nextPrompts = mergePromptsWithStrategy(
          existingPrompts,
          payload.prompts,
          strategy,
        );
      } else {
        nextPrompts = [...existingPrompts, ...payload.prompts];
      }
    }

    const validatedFinalPrompts = validatePromptCollection(nextPrompts);

    if (!savePrompts(validatedFinalPrompts)) {
      throw new Error("Unable to write imported prompts to localStorage.");
    }

    renderPrompts();
    window.alert(
      `Import successful: ${payload.prompts.length} prompt(s) processed.`,
    );
  } catch (error) {
    rollbackImport(existingRawData);
    renderPrompts();

    throw new Error(
      error instanceof Error
        ? error.message
        : "Import failed due to an unexpected error.",
    );
  }
}

// Creates a blank note record for a new prompt note.
function createEmptyNote() {
  return {
    id: crypto.randomUUID(),
    text: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// Returns a short preview string for the prompt card.
function getPreview(content) {
  return content.trim().split(/\s+/).slice(0, 12).join(" ");
}

// Paints the current star rating state for one prompt.
function paintRatingRow(ratingRow, activeRating) {
  const stars = ratingRow.querySelectorAll(".star-button");
  const ratingLabel = ratingRow.querySelector(".rating-label");

  stars.forEach((starButton, index) => {
    const filled = index < activeRating;
    starButton.classList.toggle("is-filled", filled);
    starButton.setAttribute("aria-checked", filled ? "true" : "false");
  });

  if (ratingLabel) {
    ratingLabel.textContent = activeRating ? `${activeRating}/5` : "Not rated";
  }
}

// Renders the interactive star rating control for a prompt.
function renderStarRating(prompt) {
  const ratingRow = document.createElement("div");
  ratingRow.className = "rating-row";
  ratingRow.setAttribute("role", "radiogroup");
  ratingRow.setAttribute("aria-label", `Rate ${prompt.title}`);
  ratingRow.dataset.savedRating = String(prompt.rating);

  for (let value = 1; value <= 5; value += 1) {
    const starButton = document.createElement("button");
    starButton.type = "button";
    starButton.className = `star-button${value <= prompt.rating ? " is-filled" : ""}`;
    starButton.dataset.promptId = prompt.id;
    starButton.dataset.rating = String(value);
    starButton.setAttribute(
      "aria-label",
      `${value} star${value === 1 ? "" : "s"}${value === prompt.rating ? ", selected" : ""}`,
    );
    starButton.setAttribute(
      "aria-checked",
      value <= prompt.rating ? "true" : "false",
    );
    starButton.textContent = "★";
    ratingRow.appendChild(starButton);
  }

  const ratingLabel = document.createElement("span");
  ratingLabel.className = "rating-label";
  ratingLabel.textContent = prompt.rating ? `${prompt.rating}/5` : "Not rated";
  ratingRow.appendChild(ratingLabel);

  ratingRow.addEventListener("pointerover", (event) => {
    const starButton = event.target.closest(".star-button");

    if (!starButton || !ratingRow.contains(starButton)) {
      return;
    }

    paintRatingRow(ratingRow, Number.parseInt(starButton.dataset.rating, 10));
  });

  ratingRow.addEventListener("focusin", (event) => {
    const starButton = event.target.closest(".star-button");

    if (!starButton || !ratingRow.contains(starButton)) {
      return;
    }

    paintRatingRow(ratingRow, Number.parseInt(starButton.dataset.rating, 10));
  });

  ratingRow.addEventListener("pointerleave", () => {
    paintRatingRow(
      ratingRow,
      Number.parseInt(ratingRow.dataset.savedRating, 10) || 0,
    );
  });

  ratingRow.addEventListener("focusout", (event) => {
    if (!ratingRow.contains(event.relatedTarget)) {
      paintRatingRow(
        ratingRow,
        Number.parseInt(ratingRow.dataset.savedRating, 10) || 0,
      );
    }
  });

  ratingRow.addEventListener("click", (event) => {
    const starButton = event.target.closest(".star-button");

    if (!starButton || !ratingRow.contains(starButton)) {
      return;
    }

    const rating = Number.parseInt(starButton.dataset.rating, 10);

    if (Number.isNaN(rating)) {
      return;
    }

    updatePromptRating(prompt.id, rating);
  });

  paintRatingRow(ratingRow, prompt.rating);

  return ratingRow;
}

// Renders the metadata block for a prompt card.
function renderPromptMetadata(prompt) {
  const metadata = prompt.metadata;
  const metadataSection = document.createElement("div");
  metadataSection.className = "prompt-metadata";

  const modelRow = document.createElement("div");
  modelRow.className = "metadata-row";

  const modelLabel = document.createElement("span");
  modelLabel.className = "metadata-label";
  modelLabel.textContent = "Model";

  const modelValue = document.createElement("span");
  modelValue.className = "metadata-value";
  modelValue.textContent = metadata.model;

  modelRow.append(modelLabel, modelValue);

  const createdRow = document.createElement("div");
  createdRow.className = "metadata-row";

  const createdLabel = document.createElement("span");
  createdLabel.className = "metadata-label";
  createdLabel.textContent = "Created";

  const createdValue = document.createElement("time");
  createdValue.className = "metadata-value";
  createdValue.dateTime = metadata.createdAt;
  createdValue.textContent = formatTimestamp(metadata.createdAt);

  createdRow.append(createdLabel, createdValue);

  const updatedRow = document.createElement("div");
  updatedRow.className = "metadata-row";

  const updatedLabel = document.createElement("span");
  updatedLabel.className = "metadata-label";
  updatedLabel.textContent = "Updated";

  const updatedValue = document.createElement("time");
  updatedValue.className = "metadata-value";
  updatedValue.dateTime = metadata.updatedAt;
  updatedValue.textContent = formatTimestamp(metadata.updatedAt);

  updatedRow.append(updatedLabel, updatedValue);

  const tokenRow = document.createElement("div");
  tokenRow.className = `token-estimate confidence-${metadata.tokenEstimate.confidence}`;

  const tokenLabel = document.createElement("span");
  tokenLabel.textContent = `Tokens ${metadata.tokenEstimate.min} - ${metadata.tokenEstimate.max}`;

  const confidenceBadge = document.createElement("span");
  confidenceBadge.className = "confidence-badge";
  confidenceBadge.textContent = metadata.tokenEstimate.confidence;

  tokenRow.append(tokenLabel, confidenceBadge);
  metadataSection.append(modelRow, createdRow, updatedRow, tokenRow);

  return metadataSection;
}

// Updates a prompt rating and persists it.
function updatePromptRating(promptId, rating) {
  try {
    const updatedPrompts = loadPrompts().map((prompt) => {
      if (prompt.id !== promptId) {
        return prompt;
      }

      const updatedPrompt = {
        ...prompt,
        rating,
      };

      return {
        ...updatedPrompt,
        metadata: updateTimestamps(updatedPrompt.metadata),
      };
    });

    if (!savePrompts(updatedPrompts)) {
      throw new Error("Unable to save changes right now.");
    }

    renderPrompts();
  } catch (error) {
    window.alert(
      error instanceof Error
        ? error.message
        : "Unable to save changes right now.",
    );
  }
}

// Updates the notes array for a single prompt and persists it.
function updatePromptNotes(promptId, updateCallback) {
  const updatedPrompts = loadPrompts().map((prompt) => {
    if (prompt.id !== promptId) {
      return prompt;
    }

    const updatedPrompt = {
      ...prompt,
      notes: updateCallback(prompt.notes || []),
    };

    return {
      ...updatedPrompt,
      metadata: updateTimestamps(updatedPrompt.metadata),
    };
  });

  if (!savePrompts(updatedPrompts)) {
    return false;
  }

  return updatedPrompts.find((prompt) => prompt.id === promptId) || false;
}

// Shows a brief saved status inside a note row.
function showNoteStatus(noteElement, message) {
  const status = noteElement.querySelector(".note-status");

  if (!status) {
    return;
  }

  status.textContent = message;
  status.classList.add("is-visible");

  window.setTimeout(() => {
    if (status.textContent === message) {
      status.textContent = "";
      status.classList.remove("is-visible");
    }
  }, 1500);
}

// Renders one note row with paragraph and inline edit controls.
function renderNote(promptId, note) {
  const noteItem = document.createElement("article");
  noteItem.className = "note-item";
  noteItem.dataset.promptId = promptId;
  noteItem.dataset.noteId = note.id;

  if (!note.text) {
    noteItem.classList.add("is-editing");
  }

  const noteText = document.createElement("p");
  noteText.className = "note-text";
  noteText.textContent = note.text || "";
  noteText.hidden = !note.text;

  const noteTextarea = document.createElement("textarea");
  noteTextarea.className = "note-input";
  noteTextarea.rows = 3;
  noteTextarea.value = note.text;
  noteTextarea.placeholder = "Add a note for this prompt...";
  noteTextarea.setAttribute("aria-label", "Note text");
  noteTextarea.hidden = Boolean(note.text);

  const noteActions = document.createElement("div");
  noteActions.className = "note-actions";

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "note-edit-button";
  editButton.textContent = "Edit";
  editButton.hidden = !note.text;

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "note-save-button";
  saveButton.textContent = "Save";
  saveButton.hidden = Boolean(note.text);

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "note-delete-button";
  deleteButton.textContent = "Delete";

  const status = document.createElement("span");
  status.className = "note-status";
  status.setAttribute("aria-live", "polite");

  noteActions.append(editButton, saveButton, deleteButton, status);
  noteItem.append(noteText, noteTextarea, noteActions);

  return noteItem;
}

// Renders the notes panel for a specific prompt card.
function renderNotesSection(prompt) {
  const notesSection = document.createElement("section");
  notesSection.className = "notes-section";
  notesSection.dataset.promptId = prompt.id;

  const notesHeader = document.createElement("div");
  notesHeader.className = "notes-header";

  const notesTitle = document.createElement("h4");
  notesTitle.textContent = "Notes";

  const addNoteButton = document.createElement("button");
  addNoteButton.type = "button";
  addNoteButton.className = "add-note-button";
  addNoteButton.dataset.action = "add-note";
  addNoteButton.dataset.promptId = prompt.id;
  addNoteButton.textContent = "Add Note";

  notesHeader.append(notesTitle, addNoteButton);

  const notesList = document.createElement("div");
  notesList.className = "notes-list";

  if (prompt.notes.length === 0) {
    const emptyNotes = document.createElement("p");
    emptyNotes.className = "notes-empty";
    emptyNotes.textContent =
      "No notes yet. Add one to capture context for this prompt.";
    notesList.append(emptyNotes);
  } else {
    prompt.notes.forEach((note) => {
      notesList.append(renderNote(prompt.id, note));
    });
  }

  notesSection.append(notesHeader, notesList);

  return notesSection;
}

// Adds a new blank note to a prompt and refreshes the cards.
function addNote(promptId) {
  const updated = updatePromptNotes(promptId, (notes) => [
    createEmptyNote(),
    ...notes,
  ]);

  if (!updated) {
    window.alert("Unable to save notes right now.");
    return;
  }

  renderPrompts();
}

// Saves note text, then collapses the editor back to a paragraph view.
function saveNote(promptId, noteId, noteElement) {
  const noteTextarea = noteElement.querySelector(".note-input");
  const text = noteTextarea ? noteTextarea.value.trim() : "";

  if (!text) {
    window.alert("Note text cannot be empty.");
    return;
  }

  const updated = updatePromptNotes(promptId, (notes) =>
    notes.map((note) =>
      note.id === noteId
        ? {
            ...note,
            text,
            updatedAt: Date.now(),
          }
        : note,
    ),
  );

  if (!updated) {
    window.alert("Unable to save notes right now.");
    return;
  }

  const promptCard = noteElement.closest(".prompt-card");
  const metadataElement = promptCard
    ? promptCard.querySelector(".prompt-metadata")
    : null;

  if (metadataElement) {
    metadataElement.replaceWith(
      renderPromptMetadata({ metadata: updated.metadata }),
    );
  }

  const noteText = noteElement.querySelector(".note-text");
  const editButton = noteElement.querySelector(".note-edit-button");
  const saveButton = noteElement.querySelector(".note-save-button");

  if (noteText) {
    noteText.textContent = text;
    noteText.hidden = false;
  }

  if (noteTextarea) {
    noteTextarea.hidden = true;
  }

  if (editButton) {
    editButton.hidden = false;
  }

  if (saveButton) {
    saveButton.hidden = true;
  }

  noteElement.classList.remove("is-editing");
  showNoteStatus(noteElement, "Saved");
}

// Deletes a note immediately and refreshes the card list.
function deleteNote(promptId, noteId) {
  const updated = updatePromptNotes(promptId, (notes) =>
    notes.filter((note) => note.id !== noteId),
  );

  if (!updated) {
    window.alert("Unable to update notes right now.");
    return;
  }

  renderPrompts();
}

// Renders all saved prompts and their nested note sections.
function renderPrompts() {
  const prompts = loadPrompts().sort(
    (left, right) =>
      Date.parse(right.metadata.createdAt) -
      Date.parse(left.metadata.createdAt),
  );
  promptList.innerHTML = "";
  promptCount.textContent = `${prompts.length} prompt${prompts.length === 1 ? "" : "s"}`;

  if (prompts.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";
    emptyState.textContent =
      "No prompts saved yet. Add one using the form above.";
    promptList.appendChild(emptyState);
    return;
  }

  prompts.forEach((prompt) => {
    const card = document.createElement("article");
    card.className = "prompt-card";
    card.dataset.promptId = prompt.id;

    const title = document.createElement("h3");
    title.textContent = prompt.title;

    const metadata = renderPromptMetadata(prompt);

    const preview = document.createElement("p");
    preview.textContent = getPreview(prompt.content);

    const rating = renderStarRating(prompt);

    const footer = document.createElement("div");
    footer.className = "card-footer";

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => {
      const updatedPrompts = loadPrompts().filter(
        (item) => item.id !== prompt.id,
      );

      if (!savePrompts(updatedPrompts)) {
        window.alert("Unable to save changes right now.");
        return;
      }

      renderPrompts();
    });

    footer.appendChild(deleteButton);
    const notesSection = renderNotesSection(prompt);

    card.append(title, metadata, preview, rating, notesSection, footer);
    promptList.appendChild(card);
  });
}

// Handles note actions through event delegation on the prompt list.
promptList.addEventListener("click", (event) => {
  const actionButton = event.target.closest("button[data-action]");

  if (actionButton && actionButton.dataset.action === "add-note") {
    addNote(actionButton.dataset.promptId);
    return;
  }

  const noteButton = event.target.closest(
    ".note-edit-button, .note-save-button, .note-delete-button",
  );
  if (!noteButton) {
    return;
  }

  const noteElement = noteButton.closest(".note-item");
  if (!noteElement) {
    return;
  }

  const { promptId, noteId } = noteElement.dataset;

  if (noteButton.classList.contains("note-edit-button")) {
    noteElement.classList.add("is-editing");

    const noteText = noteElement.querySelector(".note-text");
    const noteTextarea = noteElement.querySelector(".note-input");
    const editButton = noteElement.querySelector(".note-edit-button");
    const saveButton = noteElement.querySelector(".note-save-button");

    if (noteText) {
      noteText.hidden = true;
    }

    if (noteTextarea) {
      noteTextarea.hidden = false;
      noteTextarea.focus();
      noteTextarea.setSelectionRange(
        noteTextarea.value.length,
        noteTextarea.value.length,
      );
    }

    if (editButton) {
      editButton.hidden = true;
    }

    if (saveButton) {
      saveButton.hidden = false;
    }

    return;
  }

  if (noteButton.classList.contains("note-save-button")) {
    saveNote(promptId, noteId, noteElement);
  } else if (noteButton.classList.contains("note-delete-button")) {
    deleteNote(promptId, noteId);
  }
});

// Saves a newly created prompt from the main form.
form.addEventListener("submit", (event) => {
  event.preventDefault();

  const title = titleInput.value.trim();
  const modelName = modelInput ? modelInput.value.trim() : "";
  const content = contentInput.value.trim();

  if (!title || !content) {
    return;
  }

  try {
    const metadata = trackModel(modelName, content);
    const prompts = loadPrompts();
    prompts.unshift({
      id: crypto.randomUUID(),
      title,
      content,
      rating: 0,
      notes: [],
      metadata,
    });

    if (!savePrompts(prompts)) {
      throw new Error("Unable to save changes right now.");
    }

    form.reset();
    titleInput.focus();
    renderPrompts();
  } catch (error) {
    window.alert(
      error instanceof Error
        ? error.message
        : "Unable to save changes right now.",
    );
  }
});

// Opens the file picker to start an import flow.
if (importButton && importFileInput) {
  importButton.addEventListener("click", () => {
    importFileInput.click();
  });

  importFileInput.addEventListener("change", async (event) => {
    const fileInput = event.target;

    if (
      !(fileInput instanceof HTMLInputElement) ||
      !fileInput.files ||
      fileInput.files.length === 0
    ) {
      return;
    }

    const [file] = fileInput.files;

    try {
      const content = await file.text();
      const payload = parseImportPayload(content);
      importPromptsFromPayload(payload);
    } catch (error) {
      window.alert(
        error instanceof Error
          ? `Import failed: ${error.message}`
          : "Import failed due to an unexpected error.",
      );
    } finally {
      fileInput.value = "";
    }
  });
}

// Starts export flow and downloads the transfer file.
if (exportButton) {
  exportButton.addEventListener("click", () => {
    exportPrompts();
  });
}

renderPrompts();
