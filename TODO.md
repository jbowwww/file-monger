# ToDo

- Get cmds/file.ts index command running, confirm that Directory's and File's are getting created and namespaced appropriately
- Confirm on subsequent indexing's, previous FileSystem Entry documents are found by queries
- Confirm / ensure
  - pre-existing Entry's are updated with new data and only new data where necessary
  - no updates are made where there are no FS changes
- Reimplement hash, as part of File object. Use calculateHash directly
- Confirm / ensure
  - Artefact data is being emitted multiple times by Artefact.streamData()
  - Only newly resolved data properties are applied to DB