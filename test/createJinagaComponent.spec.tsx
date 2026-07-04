import { cleanup, render } from "@testing-library/react";
import { Jinaga, JinagaBrowser } from "jinaga";
import * as React from "react";
import { Application } from "./components/Application";
import { Item, ItemDeleted, Name, Root, SubItem, SubSubItem } from "./model";

describe("Specification For", () => {
    var j: Jinaga;
    var root: Root;

    beforeEach(async () => {
        j = JinagaBrowser.create({});
        root = await j.fact(new Root("home"));
    });

    afterEach(cleanup);

    it("should pass through properties", async () => {
        const { findByTestId } = render(<Application j={j} root={root} greeting="Shalom" />);
        const identifier = await findByTestId("greeting") as HTMLElement;
        expect(identifier.innerHTML).toBe("Shalom");
    });

    it("should resolve fields", async () => {
        const identifier = await whenGetIdentifier();
        expect(identifier).toBe("home");
    });

    it("should resolve properties", async () => {
        await j.fact(new Name(new Root("home"), "Home", []));

        const name = await whenGetName();
        expect(name).toBe("Home");
    });

    it("should replace previous values", async () => {
        const root = await j.fact(new Root("home"));
        const first = await j.fact(new Name(root, "Home", []));
        await j.fact(new Name(root, "Modified", [ first ]));

        const name = await whenGetName();
        expect(name).toBe("Modified");
    });

    it("should converge in a conflict", async () => {
        const root = await j.fact(new Root("home"));
        const home = await j.fact(new Name(root, "Home", []));
        const modified = await j.fact(new Name(root, "Modified", []));

        const name = await whenGetName();
        const expected = [home, modified]
            .sort((a, b) => j.hash(a).localeCompare(j.hash(b)))[1]
            .value;
        expect(name).toBe(expected);
    });

    it("should produce the same value regardless of arrival order in a conflict", async () => {
        const j1 = JinagaBrowser.create({});
        const root1 = await j1.fact(new Root("home"));
        await j1.fact(new Name(root1, "Home", []));
        await j1.fact(new Name(root1, "Modified", []));

        const { findByTestId: find1, unmount } = render(<Application j={j1} root={root1} greeting="Hello" />);
        const name1 = (await find1("name") as HTMLElement).innerHTML;
        unmount();

        const j2 = JinagaBrowser.create({});
        const root2 = await j2.fact(new Root("home"));
        await j2.fact(new Name(root2, "Modified", []));
        await j2.fact(new Name(root2, "Home", []));

        const { findByTestId: find2 } = render(<Application j={j2} root={root2} greeting="Hello" />);
        const name2 = (await find2("name") as HTMLElement).innerHTML;

        expect(name1).toBe(name2);
    });
    
    it("should resolve mutable", async () => {
        await j.fact(new Name(new Root("home"), "Home", []));

        const nameWithConflicts = await whenGetNameWithConflicts();
        expect(nameWithConflicts).toBe("Home");
    });

    it("should replace previous value in mutable", async () => {
        const root = await j.fact(new Root("home"));
        const first = await j.fact(new Name(root, "Home", []));
        await j.fact(new Name(root, "Modified", [ first ]));

        const nameWithConflicts = await whenGetNameWithConflicts();
        expect(nameWithConflicts).toBe("Modified");
    });

    it("should apply resolver in a conflict", async () => {
        const root = await j.fact(new Root("home"));
        const home = await j.fact(new Name(root, "Home", []));
        const modified = await j.fact(new Name(root, "Modified", []));

        const nameWithConflicts = await whenGetNameWithConflicts();
        const expected = [home, modified]
            .sort((a, b) => j.hash(a).localeCompare(j.hash(b)))
            .map(name => name.value)
            .join(", ");
        expect(nameWithConflicts).toBe(expected);
    });

    it("should add to a collection", async () => {
        const item = await j.fact(new Item(new Root("home"), new Date()));

        const itemHash = await whenGetTestValue("item_hash");
        expect(itemHash).toBe(j.hash(item));
    });

    it("should remove from a collection", async () => {
        const item = await j.fact(new Item(new Root("home"), new Date()));
        await j.fact(new ItemDeleted(item));

        const { queryByTestId } = render(<Application j={j} root={root} greeting="Are you there?" />);
        const element = await queryByTestId("item_hash");
        expect(element).toBe(null);
    });

    it("should pass parameters to collections", async () => {
        await j.fact(new Item(new Root("home"), new Date()));

        const { findByTestId } = render(<Application j={j} root={root} greeting="Bienvenidos" />);
        const element = await findByTestId("item_greeting");
        expect(element).toBeInstanceOf(HTMLElement);
        if (element instanceof HTMLElement) {
            expect(element.innerHTML).toBe("Hola! Bienvenidos!");
        }
    });
    
    it("should resolve fields of sub items", async () => {
        const item = await j.fact(new Item(new Root("home"), new Date()));
        const expected = new Date();
        await j.fact(new SubItem(item, expected));

        const subItemCreatedAt = await whenGetTestValue("subitem_createdat");
        expect(subItemCreatedAt).toBe(expected.toISOString());
    });

    it("should resolve sub sub items", async () => {
        const item = await j.fact(new Item(new Root("home"), new Date()));
        const subItem = await j.fact(new SubItem(item, new Date()));
        await j.fact(new SubSubItem(subItem, "reindeer flotilla"));

        const subSubItemId = await whenGetTestValue("subsubitem_id");
        expect(subSubItemId).toBe("reindeer flotilla");
    });

    it("should get new fields when fact changes", async () => {
        const { findByTestId, rerender } = render(<Application j={j} root={root} greeting="Hello" />);
        const identifier = await findByTestId("identifier") as HTMLElement;
        expect(identifier.innerHTML).toBe("home");

        rerender(<Application j={j} root={new Root("away")} greeting="Goodby" />);
        const secondIdentifier = await findByTestId("identifier") as HTMLElement;
        expect(secondIdentifier.innerHTML).toBe("away");
    });

    it("should get new props when they change", async () => {
        const { findByTestId, rerender } = render(<Application j={j} root={root} greeting="Hello" />);
        const greeting = await findByTestId("greeting") as HTMLElement;
        expect(greeting.innerHTML).toBe("Hello");

        rerender(<Application j={j} root={root} greeting="Goodby" />);
        const secondGreeting = await findByTestId("greeting") as HTMLElement;
        expect(secondGreeting.innerHTML).toBe("Goodby");
    });

    async function whenGetIdentifier() {
        return await whenGetTestValue("identifier");
    }

    async function whenGetName() {
        return await whenGetTestValue("name");
    }

    async function whenGetNameWithConflicts() {
        return await whenGetTestValue("nameWithConflicts");
    }

    async function whenGetTestValue(testId: string) {
        const { findByTestId } = render(<Application j={j} root={root} greeting="Hello" />);
        const identifier = await findByTestId(testId) as HTMLElement;
        return identifier.innerHTML;
    }
});