import { cleanup, render, screen } from "@testing-library/react";
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
        render(<Application j={j} root={root} greeting="Shalom" />);
        const identifier = await screen.findByTestId("greeting") as HTMLElement;
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

    it("should take second value in a conflict", async () => {
        const root = await j.fact(new Root("home"));
        await j.fact(new Name(root, "Home", []));
        await j.fact(new Name(root, "Modified", []));

        const name = await whenGetName();
        expect(name).toBe("Modified");
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
        await j.fact(new Name(root, "Home", []));
        await j.fact(new Name(root, "Modified", []));

        const nameWithConflicts = await whenGetNameWithConflicts();
        expect(nameWithConflicts).toBe("Home, Modified");
    });

    it("should add to a collection", async () => {
        const item = await j.fact(new Item(new Root("home"), new Date()));

        const itemHash = await whenGetTestValue("item_hash");
        expect(itemHash).toBe(j.hash(item));
    });

    it("should remove from a collection", async () => {
        const item = await j.fact(new Item(new Root("home"), new Date()));
        await j.fact(new ItemDeleted(item));

        render(<Application j={j} root={root} greeting="Are you there?" />);
        const element = await screen.queryByTestId("item_hash");
        expect(element).toBe(null);
    });

    it("should pass parameters to collections", async () => {
        await j.fact(new Item(new Root("home"), new Date()));

        render(<Application j={j} root={root} greeting="Bienvenidos" />);
        const element = await screen.findByTestId("item_greeting");
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
        const { rerender } = render(<Application j={j} root={root} greeting="Hello" />);
        const identifier = await screen.findByTestId("identifier") as HTMLElement;
        expect(identifier.innerHTML).toBe("home");

        rerender(<Application j={j} root={new Root("away")} greeting="Goodby" />);
        const secondIdentifier = await screen.findByTestId("identifier") as HTMLElement;
        expect(secondIdentifier.innerHTML).toBe("away");
    });

    it("should get new props when they change", async () => {
        const { rerender } = render(<Application j={j} root={root} greeting="Hello" />);
        const greeting = await screen.findByTestId("greeting") as HTMLElement;
        expect(greeting.innerHTML).toBe("Hello");

        rerender(<Application j={j} root={root} greeting="Goodby" />);
        const secondGreeting = await screen.findByTestId("greeting") as HTMLElement;
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
        render(<Application j={j} root={root} greeting="Hello" />);
        const identifier = await screen.findByTestId(testId) as HTMLElement;
        return identifier.innerHTML;
    }
});