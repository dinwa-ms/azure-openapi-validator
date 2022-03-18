
import {normalizePath} from "../src/utils"
import { strictEqual } from "assert";

describe("Test utils", async () => {
  it("test resolve reference",async ()=>{
    strictEqual(normalizePath("C:\\test\\a.jaon"),"c:/test/a.jaon")
    strictEqual(normalizePath("file:///C:\\test/a.jaon"),"file:///C:/test/a.jaon")
  });
});