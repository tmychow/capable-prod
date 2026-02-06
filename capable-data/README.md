# capable-data

This is our data lake. It is code to pull together all of our data from various sources. All of this gets sent to a Modal volume. Our sources include:
- Notion documents
- Historical Excel sheets we have
- Excel sheets we get sent
- Olden Labs data
- Data from our cell experiments

For now, the top priority is to get the Notion documents and historical Excel sheets into the data lake. This historical ingestion should be a one-off operation.

Going forward, we will need to ensure incremental updates occur. Our `capable-server` manages the Olden Labs data and lets scientists input data from our cell experiments, and we will probably want to add a data pipeline to handle the email source of Excel sheets.