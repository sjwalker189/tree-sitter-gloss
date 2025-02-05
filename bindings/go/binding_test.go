package tree_sitter_gloss_test

import (
	"testing"

	tree_sitter_gloss "github.com/sjwalker189/tree-sitter-gloss/bindings/go"
	tree_sitter "github.com/tree-sitter/go-tree-sitter"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(tree_sitter_gloss.Language())
	if language == nil {
		t.Errorf("Error loading Gloss grammar")
	}
}
