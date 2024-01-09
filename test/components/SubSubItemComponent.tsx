import * as React from "react";

export type SubSubItemProps = {
    id: string;
};

export function SubSubItemComponent(props: SubSubItemProps) {
    const { id } = props;
    return (
        <>
            <p data-testid="subsubitem_id">{id}</p>
        </>
    );
};