# ToDo

## Main tasks

- [X] Somehow prevent indexFileSystem task from clearing the Hash values on _ when it's undefined
  - [ ] Any logic here around invalidating the Hash when File.stats.mtime changes (or sinilar) ? Or just in the hashFiles task?
- [X] Decide whether you w want to diff each _ Artefact before update(), or do you just want to $set specific properties?
  - This might lend itself better to slicing the Artefact computations into tasks by avoiding a need to findOne() first
- [ ] Modify db methods to use Artefact.toData()
  - [ ] toData() should remove undefined's and null's
  - [ ] maybe include optional parameter original?: A , if supplied, calculates a diff and only updates with that
  - [ ] Review use of $set and otherr update operators
    - [ ] Should toData() include them or leave to the DB fn's ?
- [ ] Try watch() again - looks like can't use for await, need to use cursor.next() (and hasNext())
- [ ] Modules can define queries for use in main program, possibly actions (task inner fn's) too
- [ ] Possibly consider (again) defining schema with object literal with values that are Ctor&ltAspect&gt, AspectFn<>, or primitive
  - [ ] When reading from DB, methods will have to traverse the object and call schema's fn's for each property with the values from DB
    - [ ] Artefact.stream() might be a good place for this
  - [ ] Would allow for multiple instances of the same Aspect(s) and more freedom overall (??)
  - [ ] Queries and actions defined in modules (see above) would then need to receive property path parameters to any arguments

## Minor stuff

- [ ] Review and modify Task class usage structure e.g.:
  - [ ] Task.repeat should reset its progress counter (to what?)
  - [ ] Have a task.repeat instance method (reset to what?)
  - [ ] add a progress prefix string option to TaskOptions so can just supply that instead of a whole progress instance
- [ ] Should Progress class implement an interface with the essential members, so users may implement their own ?
- [ ] Implement a generic Options type / class to make things like TaskOpti
- [ ] Implement an UpdateOneResult type similar to UpdateOrCreateResultons as easy, simple and terse as possible
  - [ ] include defaults in a const object and the type / shape of the options
