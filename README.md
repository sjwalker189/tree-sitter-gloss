# tree-sitter-gloss

Gloss grammar for [tree-sitter](https://github.com/tree-sitter/tree-sitter)

---
Gloss

> WIP: This project is an early prototype for defining a view-layer language

Gloss is UI focused language which is transpiled to your favourite server side language. 


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
