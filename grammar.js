/**
 * @file Gloss grammar for tree-sitter
 * @author Sam Walker <sjwalker189@gmail.com>
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

// Helper functions (standard practice in Go and Rust tree-sitter grammars)
function commaSep(rule) {
  return optional(commaSep1(rule));
}

function commaSep1(rule) {
  return seq(rule, repeat(seq(",", rule)));
}

module.exports = grammar({
  name: "gloss",

  // Ignore whitespace and comments automatically
  extras: ($) => [/\s/, $.comment],

  conflicts: ($) => [[$._statement, $.expression]],

  rules: {
    // ------------------------------------------------------------------------
    // Top-Level
    // ------------------------------------------------------------------------
    source_file: ($) => repeat($._declaration),

    comment: ($) => token(seq("//", /.*/)),

    _declaration: ($) =>
      choice(
        $.enum_declaration,
        $.union_declaration,
        $.struct_declaration,
        $.function_declaration,
        $.constant_declaration,
        $.variable_declaration,
      ),

    // ------------------------------------------------------------------------
    // Declarations
    // ------------------------------------------------------------------------

    // Enums
    enum_declaration: ($) =>
      seq("enum", field("name", $.type_identifier), field("body", $.enum_body)),
    enum_body: ($) => seq("{", commaSep($.enum_variant), optional(","), "}"),
    enum_variant: ($) =>
      seq(
        field("name", $.identifier),
        optional(seq("=", field("value", $.expression))),
      ),

    // Unions
    union_declaration: ($) =>
      seq(
        "union",
        field("name", $.type_identifier),
        optional(field("type_parameters", $.type_parameters)),
        field("body", $.union_body),
      ),
    union_body: ($) => seq("{", commaSep($.union_variant), optional(","), "}"),
    union_variant: ($) =>
      seq(
        field("name", $.identifier),
        optional(field("payload", $.union_payload)),
      ),
    union_payload: ($) =>
      seq(
        "(",
        choice(
          field("type", $._type),
          field("inline_struct", $.inline_struct_type),
        ),
        ")",
      ),
    inline_struct_type: ($) =>
      seq("{", commaSep($.field_declaration), optional(","), "}"),

    slice_type: ($) => seq("[", "]", field("element", $._type)),

    // Structs
    struct_declaration: ($) =>
      seq(
        "struct",
        field("name", $.type_identifier),
        optional(field("type_parameters", $.type_parameters)),
        field("body", $.struct_body),
      ),
    struct_body: ($) =>
      seq("{", commaSep($.field_declaration), optional(","), "}"),
    field_declaration: ($) =>
      seq(
        field("name", $.identifier),
        ":", // Assuming colon is required in structs based on your snippet
        field("type", $._type),
      ),

    // Functions
    function_declaration: ($) =>
      seq(
        optional(field("visibility", $.visibility_modifier)),
        "fn",
        field("name", $.identifier),
        optional(field("type_parameters", $.type_parameters)),
        field("parameters", $.parameter_list),
        optional(field("return_type", $._type)),
        field("body", $.block),
      ),
    visibility_modifier: ($) => "pub",
    parameter_list: ($) => seq("(", commaSep($.parameter_declaration), ")"),
    parameter_declaration: ($) =>
      seq(field("name", $.identifier), ":", field("type", $._type)),

    // Variables
    variable_declaration: ($) =>
      seq(
        "let",
        field("name", $.identifier),
        "=",
        field("value", $.expression),
      ),

    constant_declaration: ($) =>
      seq(
        "const",
        field("name", $.identifier),
        "=",
        field("value", $.expression),
      ),

    // ------------------------------------------------------------------------
    // Types
    // ------------------------------------------------------------------------
    _type: ($) =>
      choice($.type_identifier, $.generic_type, $.primitive_type, $.slice_type),

    // Distinguish type identifiers (capitalized conventionally) from regular ones
    primitive_type: ($) => choice("int", "string", "bool", "void", "nil"),

    generic_type: ($) =>
      seq(
        field("name", $.type_identifier),
        field("type_arguments", $.type_arguments),
      ),
    type_parameters: ($) => seq("<", commaSep1($.type_identifier), ">"),
    type_arguments: ($) => seq("<", commaSep1($._type), ">"),

    // ------------------------------------------------------------------------
    // Statements & Blocks
    // ------------------------------------------------------------------------
    block: ($) => seq("{", repeat($._statement), optional($.expression), "}"),

    _statement: ($) =>
      choice(
        $.constant_declaration,
        $.variable_declaration,
        $.return_statement,
        $.call_expression,
        // Note: You will expand this with if, for, expression statements, etc.
      ),

    return_statement: ($) => prec.right(seq("return", optional($.expression))),

    // ------------------------------------------------------------------------
    // Expressions
    // ------------------------------------------------------------------------
    expression: ($) =>
      choice(
        $.identifier,
        $.number,
        $.string,
        $.boolean,
        $.struct_literal,
        $.call_expression,
        $.member_expression,
      ),

    struct_literal: ($) =>
      seq(
        field("type", $._type),
        "{",
        commaSep($.field_value),
        optional(","),
        "}",
      ),

    slice_literal: ($) =>
      seq(
        field("type", $.slice_type),
        "{",
        commaSep(field("element", $.expression)),
        optional(","),
        "}",
      ),

    field_value: ($) =>
      seq(field("name", $.identifier), ":", field("value", $.expression)),

    member_expression: ($) =>
      prec.left(
        2,
        seq(
          field("object", $.expression),
          ".",
          field("property", $.property_identifier),
        ),
      ),

    call_expression: ($) =>
      seq(field("function", $.expression), field("arguments", $.argument_list)),

    argument_list: ($) =>
      seq("(", optional(seq(commaSep($._argument), optional(","))), ")"),

    _argument: ($) =>
      choice($.expression, $.labeled_argument, $.punned_argument),

    // Standard labeled argument: a: 5
    labeled_argument: ($) =>
      seq(field("label", $.identifier), ":", field("value", $.expression)),

    // Punned argument: :a
    punned_argument: ($) => seq(":", field("label", $.identifier)),

    // ------------------------------------------------------------------------
    // Primitives / Terminals
    // ------------------------------------------------------------------------
    identifier: ($) => /[a-zA-Z_][a-zA-Z0-9_]*/,
    property_identifier: ($) => alias($.identifier, $.property_identifier),
    type_identifier: ($) => /[A-Z][a-zA-Z0-9_]*/,
    number: ($) => /\d+/,
    string: ($) => /"[^"]*"/,
    boolean: ($) => choice("true", "false"),
  },
});
