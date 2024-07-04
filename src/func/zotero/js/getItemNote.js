let items = Zotero.getActiveZoteroPane().getSelectedItems();
if (items.length === 0) {
    return {};
}
let item = items[0];
let noteIDs = item.getNotes();
let notes = {};
for (let id of noteIDs) {
    let note = Zotero.Items.get(id);
    let noteHTML = note.getNote();
    let title = note.getNoteTitle();
    notes[title] = noteHTML;
}
return notes;
