const storageKey = "ai-prompt-library-prompts";
const form = document.getElementById("prompt-form");
const titleInput = document.getElementById("prompt-title");
const modelInput = document.getElementById("prompt-model");
const contentInput = document.getElementById("prompt-content");
const promptList = document.getElementById("prompt-list");
const promptCount = document.getElementById("prompt-count");

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

renderPrompts();
