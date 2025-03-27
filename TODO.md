# ToDo

## Main tasks

- ~~Somehow prevent indexFileSystem task from clearing the Hash values on _ when it's undefined~~
  - ~~**Any logic here around invalidating the Hash when File.stats.mtime changes (or sinilar) ? Or just in the hashFiles task?**~~

- [X] Start using ``debug`` library and replace all console.[log|debug|error|warn|*] calls
- [ ] Implement Disks, Partitions and populate

  - [ ] Should be referenced by all FS entries, and be part of the index (partition UUID ? )
  - [ ] FS entry paths should be relative to their partition? to neutralise effects of possibly changing mount points of same disk?
- [ ] Wanting to switch again - try this:

  - [ ] Aspects as classes, because:
    - [ ] You are wanting a type anyway, and have to set it, as _T, which is awkward anyway instead of just new File(...)
    - [ ] Can have "virtual" properties i.e. getters that don't get persisted but can use them e.g. filename, or pathFromPartition, both using the actual property this.path
  - [ ] maybe Artefacts could/should be classes also? But could still try keep as type's, use a fn to define the "ctor", use DiscriminatedUnion to define an interface, which the "ctor" fn can use as return value, fn sets a property using Aspect class names of aspects passed to it (if isAspect(), or assumes it is Artefact data being passed)
    - [ ] This could probably be just as easy as a class also. Which may be nicer for Queries and stuff ?
- [ ] Modules can define queries for use in main program, possibly actions (task inner fn's) too
- [ ] Try watch() again - looks like can't use for await, need to use cursor.next() (and hasNext())
- [ ] Possibly consider (again) defining schema with object literal with values that are Ctor&ltAspect&gt, AspectFn<>, or primitive

  - [ ] When reading from DB, methods will have to traverse the object and call schema's fn's for each property with the values from DB
    - [ ] Artefact.stream() might be a good place for this
  - [ ] Would allow for multiple instances of the same Aspect(s) and more freedom overall (??)
  - [ ] Queries and actions defined in modules (see above) would then need to receive property path parameters to any arguments
- [ ] Since historical hash values of files , and most likely other things, are potentially useful information (in the case of hash values - detecting reverted, duplicated, obsolete, etc file copies) - Am considering:

  - [ ] modifying the main schema to store Entry-derived objects uniquely identified by path AND a DateTime.
  - [ ] Could be better having only most current documents for each path in one collection (ie as it is now), and another collectiion for historical documents
- [X] Decide whether you w want to diff each _ Artefact before update(), or do you just want to $set specific properties?

  - This might lend itself better to slicing the Artefact computations into tasks by avoiding a need to findOne() first
- [X] Modify db methods to use Artefact.toData()

  - [X] toData() should remove undefined's and null's - does it already? i think so

  - ~~ maybe include optional parameter original?: A , if supplied, calculates a diff and only updates with that~~
  - ~~ Review use of $set and otherr update operators~~
    - ~~ Should toData() include them or leave to the DB fn's ?~~
    - ~~While doing the above, think I may also try a slightly different schema structure, where path and stats properties are directly members of FileSystemArtefact, and a discriminator property to (has been called _T so far)~~
      - ~~This may mean endingup with a base abstract FileSystemArtefact, and FileArtefact, DirectoryArtefact, UnknownArtefact classes~~
        - ~~Will still need a discriminator to use when retrieving from DB.~~
        - ~~Should still be a class ? Best argument for using class IMHO is it allows virtual properties in the form of getter properties.~~
          - ~~Currently toData only persists properties that are fields, or have both getters and setters~~
            - ~~Should not normally need to, but if explicit control is needed, should be able to override toData() and return an object literal~~
          - ~~Also convenient place to put (keep - already there) Queries~~

## Minor stuff

- [ ] Review and modify Task class usage structure e.g.:
  - [ ] Task.repeat should reset its progress counter (to what?)
  - [ ] Have a task.repeat instance method (reset to what?)
  - [ ] add a progress prefix string option to TaskOptions so can just supply that instead of a whole progress instance
- [ ] Should Progress class implement an interface with the essential members, so users may implement their own ?
- [ ] Implement a generic Options type / class to make things like TaskOptions as easy, simple and terse as possible
  - [ ] include defaults in a const object and the type / shape of the options
- [X] Implement an UpdateOneResult type similar to UpdateOrCreateResult
- [ ] Spin out prop-path.ts to a module?
