const express = require("express");
const fs = require("fs");
const Datastore = require("@seald-io/nedb");

class Server {
  constructor() {
    this.app = express();
    this.transformImage = this.transformImage.bind(this);
  }

  async start() {
    console.log("Starting server...");
    this.db = new Datastore({ filename: "./public/apebase/db", autoload: true });
    this.db.loadDatabase((err) => {
      if (err) {
        console.error("Failed to load database:", err);
        return;
      }
      console.log("Database loaded successfully");
    });

    this.app.set("view engine", "ejs");
    this.app.get("/ipfs/:cid", (req, res) => {
      const filePath = __dirname + "/public/apebase/ipfs/" + req.params.cid;
      fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
          console.error("File not found:", filePath);
          return res.status(404).send("File not found");
        }
        res.sendFile(filePath);
      });
    });

    this.app.use(express.static("public"));
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(express.json());

    this.app.get("/", async (req, res) => {
      let q = {};
      let page = 0;
      if (req.query) {
        if (req.query.filter) {
          try {
            q = JSON.parse(req.query.filter);
          } catch (err) {
            console.error("Invalid filter query:", err);
            return res.status(400).send("Invalid filter query");
          }
        }
        if (req.query.page) page = parseInt(req.query.page, 10);
      }
      try {
        let items = await this.query(q, page);
        if (page > 0) {
          res.render("partial", { items });
        } else {
          res.render("index", {
            items,
            query: JSON.stringify(q, null, 2),
          });
        }
      } catch (err) {
        console.error("Error in GET / route:", err);
        res.status(500).send("Internal Server Error");
      }
    });

    this.app.get("/token/:id", (req, res) => {
      this.db.findOne({ id: req.params.id }, (err, doc) => {
        if (err) {
          console.error("Error finding token:", err);
          return res.status(500).send("Internal Server Error");
        }
        if (doc) this.transformImage(doc);
        res.render("token", { item: doc });
      });
    });

    this.app.listen(3010, () => {
      console.log("Server running on port 3010");
    });
  }

  query(q, page) {
    console.log("query = ", q);
    return new Promise((resolve, reject) => {
      this.db
        .find(q)
        .sort({ _id: -1 })
        .limit(20)
        .skip(page * 20)
        .exec((err, docs) => {
          if (err) {
            console.error("Database query error:", err);
            return reject(err);
          }
          if (!docs) {
            console.log("No documents found for query:", q);
            return resolve([]);
          }
          docs.forEach((doc) => this.transformImage(doc));
          resolve(docs);
        });
    });
  }

  transformImage(doc) {
    if (!doc || !doc.metadata || !doc.metadata.image) return;
    if (doc.metadata.image.startsWith("Qm")) {
      doc.metadata.image = "/ipfs/" + doc.metadata.image;
    } else if (doc.metadata.image.startsWith("/ipfs")) {
      doc.metadata.image = "/ipfs/" + doc.metadata.image.slice(5);
    } else if (doc.metadata.image.startsWith("ipfs://ipfs")) {
      doc.metadata.image = "/ipfs/" + doc.metadata.image.slice(12);
    } else if (doc.metadata.image.startsWith("ipfs://")) {
      doc.metadata.image = "/ipfs/" + doc.metadata.image.slice(7);
    }
  }
}

new Server().start();