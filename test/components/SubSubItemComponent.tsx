import * as React from "react";
import { specificationFor, field, mapProps } from "../../src";
import { SubSubItem } from "../model";

const subSubItemSpec = specificationFor(SubSubItem, {
    id: field(s =>s.id)
});

export const subSubItemMapping = mapProps(subSubItemSpec).to(({ id }) => (
    <>
        <p data-testid="subsubitem_id">{id}</p>
    </>
));