let selectedItems = Zotero.getActiveZoteroPane().getSelectedItems();
// let resItems = [];
// selectedItems.forEach(item => {
//     item = Zotero.Items.get(item.id);
//     resItems.push({
//         key: item.key,
//         title: item.title
//     });
// });
return selectedItems;
