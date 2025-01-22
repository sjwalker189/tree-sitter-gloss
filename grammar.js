/**
 * @file Gloss grammar for tree-sitter
 * @author Sam Walker <sjwalker189@gmail.com>
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

module.exports = grammar({
  name: "gloss",

  rules: {
    // TODO: add the actual grammar rules
    source_file: $ => "hello"
  }
});
