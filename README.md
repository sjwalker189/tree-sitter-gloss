# tree-sitter-gloss

A [tree-sitter](https://tree-sitter.github.io) grammar for
[Gloss](https://github.com/sjwalker189/gloss_rust) — a statically typed, immutable,
reference-counted language for building web applications.

```console
$ tree-sitter test                        # 95 corpus tests
$ script/check-against-compiler ../gloss-lang   # every real file in the compiler repo
```

## Why this is a rewrite

The previous grammar described a *different language*. It had grown from an earlier prototype
— `use "module"` where the compiler had since grown `package` and `import`, lowercase `int`
and `string` where the compiler had settled on `Int` and `Str` as ordinary names, a
`renderer` declaration for a design that was replaced by vocabularies — and by the end it
parsed **none** of the compiler's 34 examples.

Nothing said so, because its corpus tested it against itself. That is the failure this repo is
arranged to prevent, and it is why `script/check-against-compiler` exists: a corpus tells you
the grammar still agrees with what you wrote down, and only the compiler's own files tell you
it still agrees with the language.

## Three things worth knowing

**Identifier case is semantic.** `[a-z_]…` is a value, `[A-Z]…` is a type or constructor, and
that is enforced by the lexer rather than by convention. It is why Gloss has no lowercase
primitive keywords: `Int` and `Str` are ordinary names resolved against a prelude, so
`highlights.scm` colours every uppercase name as a type without needing a keyword list, and
never has to guess from context what a name is.

**`<` in expression position is always an element.** A `<` cannot begin a binary operator, so
where a value is expected it is unambiguously `<div>` and where an operand is expected it is
unambiguously less-than. The compiler's parser needs no lookahead for this and neither does
this grammar — the LR state decides. What *does* need help is telling a nested element from a
closing tag, so `</` and `/>` are single tokens here where the compiler peeks at the token
after the `<`.

**Element content is not code**, and that is the reason for `src/scanner.c`. Everything
between an element's `>` and the next `<` or `{` is character data *including its whitespace*
— the space in `<p>a b</p>` is part of the document, not trivia. `extras` cannot be turned off
for one rule, so the token is scanned externally. The compiler solves the same problem with a
lexer mode, and for the same reason: lexing that span as code is how `<p>http://x</p>` loses
its closing tag to a line comment. Both cases are in the corpus.

## Layout

| | |
|---|---|
| `grammar.js` | the grammar, annotated with what it is derived from |
| `src/scanner.c` | one external token: element character data |
| `queries/highlights.scm` | syntax highlighting |
| `queries/locals.scm` | scopes and bindings |
| `queries/injections.scm` | deliberately almost empty — see below |
| `test/corpus/` | 95 tests across items, types, expressions, control flow, patterns, elements and linear types |
| `script/check-against-compiler` | parse every `.gloss` file in the compiler repo |

## No HTML injection

The obvious injection — treating an element's content as HTML — would be wrong. `<div>` here
is not HTML: it is syntax over whatever vocabulary the program declared, and the same source
emits HTML, email or PDF depending on the medium it is handed. Injecting one of those would
highlight a lie.

## Where the grammar is deliberately more permissive than the compiler

This grammar exists to highlight code, and a file should not stop being highlightable because
one line of it will not compile. Two places it accepts what the compiler refuses:

- **A parameter with no annotation.** The compiler's own grammar accepts it too, so that the
  *checker* can explain why annotations are mandatory rather than a parse error saying
  nothing.
- **A float in a pattern.** The compiler rejects it — deciding exhaustiveness over doubles
  means deciding equality on them, and `NaN` makes that a question with no good answer.

Everything else the compiler rejects, it rejects *after* parsing, so all 23 of its error
examples parse cleanly here. That is checked.

## Keeping it in step

Run `script/check-against-compiler` after any change to the language. The compiler is the
authority, and specifically:

- `crates/gloss-syntax/src/kind.rs` — every token and node kind
- `crates/gloss-syntax/src/parser.rs` — the grammar itself
- `crates/gloss-syntax/src/lexer.rs` — including the element text mode

## Building

```console
npm install
tree-sitter generate
tree-sitter test
```
