/* AutoType guided lesson. Only loaded by how-to.html; never changes stats or wallets. */
(() => {
  "use strict";
  const root = document.getElementById("guidedTutorial");
  if (!root) return;
  const $ = id => document.getElementById(id);
  const launch = $("tutorialLaunch"), stage = $("tutorialStage");
  const word = $("tutorialGuess"), message = $("tutorialMessage");
  const input = $("tutorialInput"), type = $("tutorialType");
  const erase = $("tutorialErase"), lock = $("tutorialLock");
  const restart = $("tutorialRestart"), count = $("tutorialCount");
  const bar = $("tutorialBar"), outcome = $("tutorialOutcome");
  let phase = 0, visible = "", prefix = "", erased = 0;
  const prompts = [
    "The target is minutes. Type M to see what AutoType guesses.",
    "It guessed mild. Erase the wrong tail: D, then L. Keep MI.",
    "MI is correct. Type N and watch AutoType finish the rest.",
    "MINUTE is almost there. Type S to finish the word.",
    "Perfect. Press Lock word or Enter to finish.",
    "You did it! That's the AutoType loop."
  ];
  const nextLetter = ["m", "", "n", "s", "", ""];
  function draw() {
    const correct = Math.max(prefix.length, Math.min(visible.length, 2));
    if (!visible) word.textContent = "type a clue…";
    else {
      word.innerHTML = '<span class="guess-prefix">' + visible.slice(0, prefix.length) +
        '</span><span class="guess-ai-correct">' + visible.slice(prefix.length, correct) +
        '</span><span class="guess-ai">' + visible.slice(correct) + '</span>';
    }
    word.classList.toggle("guess-correct", phase >= 4);
    message.textContent = prompts[phase];
    count.textContent = phase === 5 ? "Complete" : "Step " + Math.min(phase + 1, 5) + " of 5";
    bar.style.width = (phase === 5 ? 100 : phase * 20) + "%";
    type.hidden = !nextLetter[phase];
    type.textContent = nextLetter[phase] ? "Type " + nextLetter[phase].toUpperCase() : "Type";
    erase.hidden = phase !== 1;
    lock.hidden = phase !== 4;
    outcome.hidden = phase !== 5;
    input.disabled = phase === 5;
    if (phase === 5) input.blur();
  }
  function flash() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
        document.body.classList.contains("animations-off")) return;
    word.classList.remove("guide-word-pop");
    void word.offsetWidth;
    word.classList.add("guide-word-pop");
  }
  function typeLetter(ch) {
    if (phase === 0 && ch === "m") {
      visible = "mild"; prefix = "m"; phase = 1;
    } else if (phase === 2 && ch === "n") {
      visible = "minute"; prefix = "minute"; phase = 3;
    } else if (phase === 3 && ch === "s") {
      visible = "minutes"; prefix = "minutes"; phase = 4;
    } else return;
    draw(); flash();
  }
  function backspace() {
    if (phase !== 1) return;
    if (visible.length > 2) {
      visible = visible.slice(0, -1);
      erased++;
    }
    if (erased === 2) { prefix = "mi"; phase = 2; }
    draw(); flash();
  }
  function lockWord() {
    if (phase !== 4 || visible !== "minutes") return;
    phase = 5; draw(); flash();
  }
  function typed(raw) {
    for (const char of raw.toLowerCase()) {
      if (char === " " || char === "\n") lockWord();
      else if (/^[a-z]$/.test(char)) typeLetter(char);
    }
  }
  function reset() {
    phase = 0; visible = ""; prefix = ""; erased = 0;
    input.value = ""; stage.hidden = false; launch.hidden = true;
    draw();
  }
  launch.addEventListener("click", () => {
    reset();
    input.focus({preventScroll:true});
  });
  type.addEventListener("click", () => typeLetter(nextLetter[phase]));
  erase.addEventListener("click", backspace);
  lock.addEventListener("click", lockWord);
  restart.addEventListener("click", reset);
  input.addEventListener("keydown", event => {
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault(); backspace();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault(); lockWord();
    }
  });
  input.addEventListener("beforeinput", event => {
    if (event.inputType && event.inputType.startsWith("delete")) {
      event.preventDefault(); backspace();
    }
  });
  input.addEventListener("input", () => {
    const value = input.value;
    input.value = "";
    typed(value);
  });
  draw();
})();
