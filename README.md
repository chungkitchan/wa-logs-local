# WA Logs download tool

This tool will download the Watson assistant log stored in Cloudant by the orchestrator.

## Installation / Configuration

1. Download the tool excecution file based on your os:  
   - [Mac OS](bin/wa-logs-local-macos)    
   - [Linux](bin/wa-logs-local-linux)   
   - [Windows](bin/wa-logs-local-win.exe)  
1. Edit the .env-sample, ensure that the CLOUDANT_URL & LOG_DBNAME are properly filled according to Cloudant credential.  
1. Rename the .env-sample to .env  
1. Run the downloaded execution file based on your os  
1. The report should be store in "usage.csv"  