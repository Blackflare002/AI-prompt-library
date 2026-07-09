const storageKey = "ai-prompt-library-prompts";
const form = document.getElementById("prompt-form");
const titleInput = document.getElementById("prompt-title");
const contentInput = document.getElementById("prompt-content");
const promptList = document.getElementById("prompt-list");
const promptCount = document.getElementById("prompt-count");

function normalizePrompt(prompt) {
  return {
    ...prompt,
    rating: Number.isInteger(prompt.rating) ? prompt.rating : 0,
  };
}

function loadPrompts() {
  const storedPrompts = localStorage.getItem(storageKey);

  try {
    const prompts = storedPrompts ? JSON.parse(storedPrompts) : [];

    return Array.isArray(prompts) ? prompts.map(normalizePrompt) : [];
  } catch {
    return [];
  }
}

function savePrompts(prompts) {
  localStorage.setItem(storageKey, JSON.stringify(prompts));
}

function getPreview(content) {
  return content.trim().split(/\s+/).slice(0, 12).join(" ");
}

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

function updatePromptRating(promptId, rating) {
  const updatedPrompts = loadPrompts().map((prompt) => {
    if (prompt.id !== promptId) {
      return prompt;
    }

    return {
      ...prompt,
      rating,
    };
  });

  savePrompts(updatedPrompts);
  renderPrompts();
}

function renderPrompts() {
  const prompts = loadPrompts();
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

    const title = document.createElement("h3");
    title.textContent = prompt.title;

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
      savePrompts(updatedPrompts);
      renderPrompts();
    });

    footer.appendChild(deleteButton);
    card.append(title, preview, rating, footer);
    promptList.appendChild(card);
  });
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const title = titleInput.value.trim();
  const content = contentInput.value.trim();

  if (!title || !content) {
    return;
  }

  const prompts = loadPrompts();
  prompts.unshift({
    id: crypto.randomUUID(),
    title,
    content,
    rating: 0,
  });

  savePrompts(prompts);
  form.reset();
  titleInput.focus();
  renderPrompts();
});

renderPrompts();
