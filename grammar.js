/**
 * @file Gloss grammar for tree-sitter
 * @author Sam Walker <sjwalker189@gmail.com>
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check
const PREC = {
  COMMENT: 1, // Prefer comments over regexes
  STRING: 2, // In a string, prefer string characters over comments

  ASSIGN: 0,
  TERNARY: 1,
  OR: 2,
  AND: 3,
  REL: 4,
  PLUS: 5,
  TIMES: 6,
  EXP: 7,
  CALL: 8,
  MEMBER: 9,
};

module.exports = grammar({
  name: "gloss",

  extras: ($) => [
    $.comment,
    $.developer_comment,
    /[\s\uFEFF\u2060\u200B\u00A0]/,
  ],

  conflicts: ($) => [[$.comment, $.developer_comment, $.parameter_declaration]],

  inline: ($) => [
    $._expression,
    $._attribute_expression,
    $._call_signature,
    $._formal_parameter,
    $._constructable_expression,
    $._declaration,
  ],

  supertypes: ($) => [$._declaration],

  rules: {
    program: ($) => repeat($._declaration),

    model_declaration: ($) =>
      prec(
        PREC.MEMBER,
        // TODO: Explore composition using "model Child < Base {}" or "model Child(Base) {}"
        seq("model", field("name", $._type_identifier), $.statement_block),
      ),

    view_declaration: ($) =>
      prec(
        PREC.MEMBER,
        seq(
          "view",
          field("name", $.identifier),
          optional(seq("(", optional($.parameter_declaration), ")")),
          $.view_block,
        ),
      ),

    enum_declaration: ($) =>
      prec(PREC.MEMBER, seq("enum", $.identifier, $.enum_block)),

    declaration: ($) =>
      choice($.model_declaration, $.view_declaration, $.enum_declaration),

    _declaration: ($) =>
      choice($.model_declaration, $.view_declaration, $.enum_declaration),

    developer_comment: ($) => token(seq("//", /[^/].*/)),

    comment: ($) => prec(PREC.COMMENT, token(seq("///", /.*/))),

    // model block statement
    statement_block: ($) =>
      seq("{", optional(repeat1($.column_declaration)), "}"),

    enum_block: ($) => seq("{", optional(repeat($.enumeral)), "}"),

    view_block: ($) => seq("{", /* TODO */ "}"),

    column_declaration: ($) =>
      seq(alias($.identifier, $.property_identifier), $.column_type, "\n"),

    assignment_pattern: ($) =>
      seq($.identifier, "=", $._constructable_expression),

    assignment_expression: ($) =>
      prec.right(
        PREC.ASSIGN,
        seq(alias($.identifier, $.variable), "=", $._expression),
      ),

    binary_expression: ($) =>
      choice(
        ...[
          ["&&", PREC.AND],
          ["||", PREC.OR],
          [">>", PREC.TIMES],
          [">>>", PREC.TIMES],
          ["<<", PREC.TIMES],
          ["&", PREC.AND],
          ["^", PREC.OR],
          ["|", PREC.OR],
          ["+", PREC.PLUS],
          ["-", PREC.PLUS],
          ["*", PREC.TIMES],
          ["/", PREC.TIMES],
          ["%", PREC.TIMES],
          ["**", PREC.EXP],
          ["<", PREC.REL],
          ["<=", PREC.REL],
          ["==", PREC.REL],
          ["===", PREC.REL],
          ["!=", PREC.REL],
          ["!==", PREC.REL],
          [">=", PREC.REL],
          [">", PREC.REL],
        ].map(([operator, precedence]) =>
          prec.left(
            precedence,
            seq($._expression, field("operator", operator), $._expression),
          ),
        ),
      ),

    member_expression: ($) =>
      prec(
        PREC.MEMBER,
        seq(
          choice($.identifier, $.member_expression),
          ".",
          alias($.identifier, $.property_identifier),
        ),
      ),

    column_type: ($) =>
      seq(
        field("type", $._type_identifier),
        optional(choice($.maybe, $.array)),
      ),

    call_expression: ($) =>
      prec(PREC.CALL, seq($._constructable_expression, $.arguments)),

    // attribute: ($) => seq("@", $._attribute_expression),
    parameter_list: ($) =>
      seq(
        "(",
        optional(seq(commaSep($.parameter_declaration), optional(","))),
        ")",
      ),

    // props AppProps
    parameter_declaration: ($) =>
      seq(field("name", $.identifier), field("type", $._type_identifier)),

    arguments: ($) => seq("(", commaSep(optional($._expression)), ")"),

    _call_signature: ($) => seq(field("parameters", $.formal_parameters)),

    formal_parameters: ($) =>
      seq("(", optional(seq(commaSep1($._formal_parameter))), ")"),

    _formal_parameter: ($) =>
      choice($.identifier, $.string, $.array, $.assignment_pattern),

    _attribute_expression: ($) =>
      choice($.identifier, $.call_expression, $.member_expression),

    _expression: ($) =>
      choice(
        $._constructable_expression,
        $.assignment_expression,
        $.call_expression,
        $.binary_expression,
      ),

    _constructable_expression: ($) =>
      choice(
        $.identifier,
        $.member_expression,
        $.number,
        $.string,
        $.true,
        $.false,
        $.null,
        $.array,
      ),

    identifier: ($) => {
      const alpha =
        /[^\x00-\x1F\s\p{Zs}0-9:;`"'@#.,|^&<=>+*/\\%?!~()\[\]{}\uFEFF\u2060\u200B]|\\u[0-9a-fA-F]{4}|\\u\{[0-9a-fA-F]+\}/;
      const alphanumeric =
        /[^\x00-\x1F\s\p{Zs}:;`"'@#.,|^&<=>+*/\\%?!~()\[\]{}\uFEFF\u2060\u200B]|\\u[0-9a-fA-F]{4}|\\u\{[0-9a-fA-F]+\}/;
      return token(seq(alpha, repeat(alphanumeric)));
    },

    _type_identifier: ($) => alias($.identifier, $.type_identifier),

    string: ($) =>
      token(
        choice(
          seq("'", /([^'\n]|\\(.|\n))*/, "'"),
          seq('"', /([^"\n]|\\(.|\n))*/, '"'),
        ),
      ),

    enumeral: ($) => {
      const alpha =
        /[^\x00-\x1F\s\p{Zs}0-9:;`"'@#.,|^&<=>+*/\\%?!~()\[\]{}\uFEFF\u2060\u200B]|\\u[0-9a-fA-F]{4}|\\u\{[0-9a-fA-F]+\}/;
      const alphanumeric =
        /[^\x00-\x1F\s\p{Zs}:;`"'@#.,|^&<=>+*/\\%?!~()\[\]{}\uFEFF\u2060\u200B]|\\u[0-9a-fA-F]{4}|\\u\{[0-9a-fA-F]+\}/;
      return token(seq(alpha, repeat(alphanumeric)));
    },

    number: ($) => /\d+/,
    array: ($) => seq("[", commaSep(optional($._expression)), "]"),
    maybe: ($) => "?",
    true: ($) => "true",
    false: ($) => "false",
    null: ($) => "null",
  },
});

function commaSep1(rule) {
  return seq(rule, repeat(seq(",", rule)));
}

function commaSep(rule) {
  return optional(commaSep1(rule));
}
