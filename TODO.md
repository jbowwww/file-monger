# ToDo

- Somehow prevent indexFileSystem task from clearing the Hash values on _ when it's undefined
  - Any logic here around invalidating the Hash when File.stats.mtime changes (or sinilar) ? Or just in the hashFiles task?
- Decide whether you still want to diff each _ Artefact before update(), or do you just want to $set specific properties?
  - This might lend itself better to slicing the Artefact computations into tasks by avoiding a need to findOne() first
- Implement an UpdateOneResult type similar to UpdateOrCreateResult