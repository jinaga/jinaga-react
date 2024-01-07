import { buildModel } from "jinaga";

export class Root {
    static Type = 'Application.Root';
    type = Root.Type;

    constructor(
        public identifier: string
    ) { }
}

export class Item {
    static Type = 'Application.Item';
    type = Item.Type;

    constructor(
        public root: Root,
        public createdAt: Date | string
    ) { }
}

export class ItemDeleted {
    static Type = 'Application.Item.Deleted';
    type = ItemDeleted.Type;

    constructor(
        public item: Item
    ) { }
}

export class ItemDescription {
    static Type = 'Application.Item.Description';
    type = ItemDescription.Type;

    constructor(
        public item: Item,
        public value: string,
        public prior: ItemDescription[]
    ) { }
}

export class SubItem {
    static Type = 'Application.SubItem';
    type = SubItem.Type;

    constructor(
        public item: Item,
        public createdAt: Date | string
    ) { }
}

export class SubSubItem {
    static Type = 'Application.SubSubItem';
    type = SubSubItem.Type;

    constructor(
        public subItem: SubItem,
        public id: string
    ) { }
}

export class Name {
    static Type = 'Application.Name';
    type = Name.Type;

    constructor(
        public root: Root,
        public value: string,
        public prior: Name[]
    ) { }
}

export const model = buildModel(b => b
    .type(Root)
    .type(Item, m => m
        .predecessor("root", Root)
    )
    .type(ItemDeleted, m => m
        .predecessor("item", Item)
    )
    .type(ItemDescription, m => m
        .predecessor("item", Item)
        .predecessor("prior", ItemDescription)
    )
    .type(SubItem, m => m
        .predecessor("item", Item)
    )
    .type(SubSubItem, m => m
        .predecessor("subItem", SubItem)
    )
    .type(Name, m => m
        .predecessor("root", Root)
        .predecessor("prior", Name)
    )
);