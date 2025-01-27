import { formatDateTime, getMarkdown, getNotebook, listDailynote } from "@frostime/siyuan-plugin-kits";


const TodayDailyNoteProvicer: CustomContextProvider = {
    name: "Dailynote",
    icon: 'iconCalendar',
    displayTitle: "Dailynote",
    description: "今天编写的 Dailynote",
    getContextItems: async (): Promise<ContextItem[]> => {
        const docs = await listDailynote({
            after: new Date()
        });
        if (!docs?.length) {
            return [];
        }

        const results = docs.map(async (doc) => {
            const markdown = await getMarkdown(doc.id);
            return {
                name: doc.content,
                description: `笔记本 ${getNotebook(doc.box).name} 在 ${formatDateTime('yyyy-MM-dd')} 的 Dailynote`,
                content: markdown,
            };
        });
        const items = await Promise.all(results);
        return items;
    },
};


export default TodayDailyNoteProvicer;
