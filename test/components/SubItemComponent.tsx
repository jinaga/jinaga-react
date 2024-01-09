import * as React from "react";
import { SubSubItemComponent, SubSubItemProps } from "./SubSubItemComponent";

export type SubItemProps = {
    createdAt: string;
    subSubItems: SubSubItemProps[];
};

export function SubItemComponent(props: SubItemProps) {
    const { createdAt, subSubItems } = props;
    return (
        <>
            <p data-testid="subitem_createdat">{createdAt}</p>
            {subSubItems.map(subSubItem => (
                <SubSubItemComponent key={subSubItem.id} {...subSubItem} />
            ))}
        </>
    );
};