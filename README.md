# tree-sitter-gloss

Gloss grammar for [tree-sitter](https://github.com/tree-sitter/tree-sitter)

---
Gloss

> WIP: This project is an early prototype for defining a view-layer language

Gloss is UI focused language which is transpiled to your favourite server side language. 

Think of gloss as gRPC for your UI.


## Syntax

```
enum Status {
  Active
  Disabled
}

model User {
  id Int
  first_name String
  last_name String
  status Status
  name () -> String
}

model UserProfileProps {
  user User
}

view UserProfile({ user } UserProfileProps) {
  <div>
     <h3>{user.name()}</h3>
     @if(user.status == Status.Disabled)
        <ArchivedBadge />
     @endif
  <div>
}
```
## Rationale
- Templating languages are largely awful
- Describing UI code in XML-like is desirable
- Developers ought be able to use the same UI code across environments and not be forced into server rendered javascript (e.g, react, vue, svelte, etc)
- Views define the type contract, not the other way around. 
- Table stakes (Must have)
  - Statically checked type system
  - Language server (intellisense)
  - Automatic formatting
  - Transpile to natural code. (The final result is code that you compile with your project, Go, Java, Swift, etc)


