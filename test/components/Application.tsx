import { Jinaga } from "jinaga";
import * as React from "react";
import { useSpecification } from "../../src";
import { Item, ItemDeleted, Name, Root, SubItem, SubSubItem, model } from "../model";
import { LineItem } from "./LineItem";

const detailsOfRoot = model.given(Root).select(root => ({
    names: root.successors(Name, name => name.root)
        .notExists(name => name.successors(Name, next => next.prior)),
    items: root.successors(Item, item => item.root)
        .notExists(item => item.successors(ItemDeleted, deleted => deleted.item))
        .select(item => ({
            hash: Jinaga.hash(item),
            subItems: item.successors(SubItem, subitem => subitem.item)
                .select(subitem => ({
                    hash: Jinaga.hash(subitem),
                    createdAt: subitem.createdAt,
                    subSubItems: subitem.successors(SubSubItem, subsubitem => subsubitem.subItem)
                        .select(subsubitem => ({
                            hash: Jinaga.hash(subsubitem),
                            id: subsubitem.id
                        }))
                }))
        }))
}));

export type ApplicationProps = {
    j: Jinaga;
    greeting: string;
    root: Root | null;
}

export const Application = (props: ApplicationProps) => {
    const { j, greeting, root } = props;
    const { data } = useSpecification(j, detailsOfRoot, root);

    if (!data || data.length !== 1) {
        return null;
    }

    const { names, items } = data[0];
    const name = names.length > 0 ? names[names.length - 1].value : "";
    const nameWithConflicts = names.map(n => n.value).join(", ");

    return (
        <>
            <p data-testid="greeting">{greeting}</p>
            <p data-testid="identifier">{root?.identifier}</p>
            <p data-testid="name">{name}</p>
            <p data-testid="nameWithConflicts">{nameWithConflicts}</p>
            {items.map(item => (
                <LineItem key={item.hash} greeting={`Hola! ${greeting}!`} {...item} />
            ))}
        </>
    );
}