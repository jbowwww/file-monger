import * as FileSystem from "./file-system";
import {} from "./schema";

for await (const entry of FileSystem.walk({ path: "./" })) {
    
}