import { Jinaga } from "jinaga";
import * as React from "react";
import { useSpecifications } from "../../src";
import { Item, ItemDeleted, Name, Root, SubItem, SubSubItem, model } from "../model";
import { LineItem } from "./LineItem";

const namesOfRoot = model.given(Root).match((root, facts) =>
    facts.ofType(Name)
        .join(name => name.root, root)
        .notExists(name => facts.ofType(Name)
            .join(next => next.prior, name)
        )
)

const itemsInRoot = model.given(Root).match((root, facts) =>
    facts.ofType(Item)
        .join(item => item.root, root)
        .notExists(item => facts.ofType(ItemDeleted)
            .join(deleted => deleted.item, item)
        )
        .select(item => ({
            hash: Jinaga.hash(item),
            subItems: facts.ofType(SubItem)
                .join(subitem => subitem.item, item)
                .select(subitem => ({
                    hash: Jinaga.hash(subitem),
                    createdAt: subitem.createdAt,
                    subSubItems: facts.ofType(SubSubItem)
                        .join(subsubitem => subsubitem.subItem, subitem)
                        .select(subsubitem => ({
                            hash: Jinaga.hash(subsubitem),
                            id: subsubitem.id
                        }))
                }))
        }))
)

export type ApplicationProps = {
    j: Jinaga;
    greeting: string;
    root: Root | null;
}

export const Application = (props: ApplicationProps) => {
    const { j, greeting, root } = props;
    const { data } = useSpecifications(j, {
        names: namesOfRoot,
        items: itemsInRoot
    }, root);

    if (!data) {
        return null;
    }

    const { names, items } = data;
    const name = names.length > 0 ? names[0].value : "";
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