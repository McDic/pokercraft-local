# Translations

Every piece of text the app shows — the website chrome, the charts, and the exported
HTML — is looked up from the JSON files in this directory. **You do not need to know
TypeScript to translate Pokercraft Local.** Edit one JSON file and open a pull request.

## Files

| File | Language |
| --- | --- |
| `en.json` | English — the source of truth |
| `ko.json` | Korean (한국어) |

`en.json` defines every key that exists. All other files translate those keys.

## Translating an existing language

Open the file for your language, find the key you want to fix, and change the value on
the right of the colon. Leave the key on the left alone.

```json
"header.export": "HTML 내보내기"
```

**A missing key is fine.** If a key is absent from your file, the English text is shown
instead. So a partial translation is a perfectly good pull request — translate what you
can, and leave the rest.

## Adding a new language

1. Copy `en.json` to `<code>.json`, where `<code>` is the
   [ISO 639-1 code](https://en.wikipedia.org/wiki/List_of_ISO_639_language_codes)
   for your language (`ja` for Japanese, `zh` for Chinese, `es` for Spanish, …).
2. Translate the values.
3. Register it in [`../index.ts`](../index.ts): add an `import`, then one entry to the
   `LANGUAGES` list, copying the shape of the `ko` line —

   ```ts
   import ja from './locales/ja.json'

   export const LANGUAGES = [
     { code: 'en', label: 'English', translation: en },
     { code: 'ko', label: '한국어', translation: ko },
     { code: 'ja', label: '日本語', translation: ja },   // <- your language
   ] as const
   ```

   `LANGUAGES` is the only registry: the switcher, i18next, and the tests all read from
   it. Write `label` in your own language — someone who cannot read the current one still
   has to be able to find theirs in the menu.

## Rules for values

Three kinds of markup appear inside the text. **Copy them exactly** — translate only the
words around them.

### 1. `{{...}}` — values the app fills in

```json
"progress.equity": "Calculating equity: {{current}}/{{total}}"
```

`{{current}}` and `{{total}}` are replaced with real numbers at runtime. Keep every
placeholder that the English has; you may reorder them to suit your language's grammar.
Dropping one leaves a hole in the sentence, so a test will fail if the placeholders in
your file do not match the ones in `en.json`.

### 2. `%{...}` — values Plotly fills in

Chart tooltips use Plotly's own syntax, which looks similar but uses a **single** brace
after the percent sign:

```json
"chart.chipHistories.hover.survival": "Hand #%{x}<br>Survival: %{y:.1%}<extra></extra>"
```

Copy `%{x}`, `%{y:.1%}`, `%{customdata[0]}` and friends verbatim, including the format
suffix after the colon. Translate only the surrounding words (`Hand`, `Survival`).

### 3. HTML tags

`<b>`, `<br>`, and `<extra></extra>` are markup, not text. Keep them, and keep them
balanced.

## Poker jargon

Terms that players use in English regardless of their own language — `RR`, `RRE`,
`PERR`, `VPIP`, `ITM`, `UTG`, `BTN`, `CO` — are deliberately left in English in
`ko.json`, because that is how Korean poker players actually speak. Every one of them is
still a key, so if that is *not* true for your language, translate them freely.

## Checking your work

```bash
cd web
npm test          # verifies keys and placeholders line up with en.json
npm run dev       # see it in the browser; the language switcher is in the header
```

If you cannot run these, open the pull request anyway — CI runs them for you.
