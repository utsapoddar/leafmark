# Lecture Mode product mechanics

Lecture Mode turns a generated book guide into a guided explanation. It is not a fifth summary length and it does not replace Snapshot, Key Ideas, Chapter Guide, or Deep Dive. A reader explicitly starts it from a particular idea or chapter when they want to understand, retain, and apply that material.

This specification adapts the pedagogical control system from the original `lecturer-mode` skill. The skill's machine-specific commands and assistant-runtime configuration are intentionally excluded from the web product.

## Product contract

- Activation is explicit: **Teach me this** or **Start Lecture Mode**.
- The experience teaches directly. It may ask occasional low-stakes prediction or recall questions, but it must not become a Socratic interrogation.
- It teaches one conceptual jump at a time and keeps the reader oriented.
- The teaching framework remains invisible. UI headings name book content, never stages such as “hook,” “formalism,” or “mistake checkpoint.”
- Book claims, definitions, notation, and examples retain page or section citations.
- An analogy or application invented by Leafmark is labeled **Leafmark example** so it cannot be mistaken for the author's material.
- A reader can always choose **I’m lost**, **Give me an example**, **Go deeper**, or **Continue**.

## Internal teaching arc

The engine follows this state machine internally:

```text
orient → concrete anchor → familiar model → one twist → new model
       → core/optional split → precise form → reset → application
       → tempting mistake → reset → transfer
```

These names never appear as learner-facing headings.

### Orient

Lower unnecessary difficulty without fake encouragement. Name the actual bottleneck, say what the reader should hold onto first, and preview the destination in one sentence.

### Reuse an existing intuition

Start from something the reader is likely to understand already. Prefer, in order:

1. An earlier concept from this same book.
2. The author's own recurring example.
3. A universal anchor such as physical cause and effect, trade-offs, maps, recipes, games, or debugging.

Add one small change, name what changed, and only then introduce the author's new concept.

### Formalize after meaning

Definitions, frameworks, equations, and notation arrive only after the reader has a reusable plain-language sentence. Present formalism as a compressed version of the intuition, then translate it back into ordinary language.

For multi-step arguments, show the destination first, name the missing pieces, and fill them in one at a time.

### Expose the useful mistake

For substantial concepts, include one tempting wrong interpretation. Explain why it seems reasonable, where it breaks, how the author or an expert corrects it, and what cue helps the reader recognize that mistake later.

Do not invent an “author's warning.” If the mistake is Leafmark's instructional synthesis rather than something discussed in the book, label it accordingly.

### Apply and transfer

Use the concept on a fresh case. Finish by telling the reader what they can now recognize, explain, solve, or apply and give one repeatable next move.

## Learner-facing shape

The arc should read like a coherent whiteboard explanation, not a stack of pedagogical widgets. Content-specific headings are allowed. The only instructional labels carried over from the skill are:

- **Keep this:** the minimum mental model worth retaining.
- **Skip for now:** optional derivation, edge case, history, or extra detail.

At transition points, use short plot resets in natural prose: restate where the explanation started, what changed, and why the change matters.

## Interaction mechanics

Each lecture operates on one selected content unit from Leafmark's future source-linked content ledger.

1. Show the destination and an initial explanation.
2. Invite one-sentence prediction or recall at a meaningful transition.
3. Let the reader answer or choose **Reveal and continue**; never block progress behind a quiz.
4. Compare the response semantically with the cited core idea.
5. If understanding looks stable, advance one conceptual jump.
6. If the reader chooses **I’m lost** or the response misses the core change, return to the last stable idea, shrink the example, and rebuild with one smaller twist.
7. End with a fresh application and a transfer prompt.

The session state stays on the device and records only the current idea, the last stable checkpoint, optional-detail preference, and recall status.

## Required source data

Lecture Mode should not be generated directly from raw PDF pages. It depends on the planned book content ledger:

```ts
type LectureSource = {
  concept: string;
  plainLanguageMeaning: string;
  dependsOn: string[];
  changesWhat: string;
  authorExamples: SourceSpan[];
  definition?: SourceSpan;
  formalism?: SourceSpan;
  caveats: SourceSpan[];
  applications: SourceSpan[];
  citations: SourceSpan[];
};
```

The engine retrieves the cited passages again before drafting each lecture segment. This prevents errors from compounding through layers of earlier summaries.

## Quality gates

A lecture is ready only when:

- the core idea can be restated in one plain-language sentence;
- every author-attributed claim has supporting source spans;
- the hook and application serve the same conceptual anchor;
- no formalism appears before its intuition;
- optional detail is separable from the load-bearing explanation;
- the mistake checkpoint corrects a plausible misunderstanding rather than creating trivia;
- the final transfer step requires using the idea on a new case;
- stage directions are absent from learner-facing copy.

## Implementation order

1. Build the chapter-aware, source-linked content ledger.
2. Add **Teach me this** to Key Ideas and Chapter Guide items.
3. Implement the deterministic lecture state and local session storage.
4. Use the current extractive engine for citations and core sentences.
5. Add optional on-device generation for anchors, transitions, decompressed explanations, and answer comparison.
6. Test with public-domain nonfiction before enabling it for fiction.
