import * as React from "react";
import { SubItemComponent, SubItemProps } from "./SubItemComponent";

type LineItemProps = {
    greeting: string;
    hash: string;
    subItems: SubItemProps[];
};

export const LineItem = (props: LineItemProps) => {
    const { greeting, hash, subItems } = props;

    return (
        <>
            <p data-testid="item_hash">{hash}</p>
            <p data-testid="item_greeting">{greeting}</p>
            {subItems.map(subItem => (
                <SubItemComponent key={subItem.createdAt} {...subItem} />
            ))}
        </>
    );
}