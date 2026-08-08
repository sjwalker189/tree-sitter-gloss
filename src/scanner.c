// An external scanner for one token: the character data inside an element.
//
// It exists because `extras` cannot be turned off for a single rule. Everything between an
// element's `>` and the next `<` or `{` is content *including its whitespace* — the space in
// `<p>a b</p>` is part of the document, and the newline and indentation in
//
//     <div>
//       hello
//     </div>
//
// are too. A normal grammar rule cannot express that, because tree-sitter skips whitespace
// before attempting any token, so `hello` would arrive with its surroundings already eaten.
//
// The compiler solves the same problem with a lexer *mode*: inside an element the only tokens
// are a run of text, a `<`, and a `{}`, and nothing else applies — no comments, no string
// literals, no operators. That is the reason `<p>http://x</p>` does not lose its closing tag
// to a line comment, and it is the behaviour reproduced here.
//
// The scanner is stateless. Tree-sitter tells us whether `element_text` is valid in the
// current parse state, which is all the context this needs — the LR automaton has already
// decided we are inside an element.

#include "tree_sitter/parser.h"

enum TokenType {
  ELEMENT_TEXT,
};

void *tree_sitter_gloss_external_scanner_create(void) { return NULL; }
void tree_sitter_gloss_external_scanner_destroy(void *payload) { (void)payload; }
void tree_sitter_gloss_external_scanner_reset(void *payload) { (void)payload; }

unsigned tree_sitter_gloss_external_scanner_serialize(void *payload, char *buffer) {
  (void)payload;
  (void)buffer;
  return 0;
}

void tree_sitter_gloss_external_scanner_deserialize(void *payload, const char *buffer,
                                                    unsigned length) {
  (void)payload;
  (void)buffer;
  (void)length;
}

bool tree_sitter_gloss_external_scanner_scan(void *payload, TSLexer *lexer,
                                             const bool *valid_symbols) {
  (void)payload;

  if (!valid_symbols[ELEMENT_TEXT]) {
    return false;
  }

  // Run to the next `<` or `{`, or to the end of the file. `}` is deliberately *not* a
  // terminator: a closing brace with no opening one is ordinary text, and treating it as a
  // delimiter would split `<p>a } b</p>` into three children for no reason.
  bool consumed_any = false;
  while (lexer->lookahead != 0 && lexer->lookahead != '<' && lexer->lookahead != '{') {
    lexer->advance(lexer, false);
    consumed_any = true;
  }

  if (!consumed_any) {
    return false;
  }

  lexer->result_symbol = ELEMENT_TEXT;
  lexer->mark_end(lexer);
  return true;
}
