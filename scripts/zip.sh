SCRIPT_PATH=`realpath $0`
SCRIPT_DIR=`dirname "$SCRIPT_PATH"`
SLN_NAME=`basename "$(dirname "$SCRIPT_DIR")"`

#echo 0=$0 SCRIPT_PATH=$SCRIPT_PATH SCRIPT_DIR=$SCRIPT_DIR SLN_NAME=$SLN_NAME
echo

ZIP_FILE="${SLN_NAME}_${1:-preedit}.zip"
zip -rv $ZIP_FILE package.json tsconfig.json README.md docker-compose.yaml .gitignore src docker/NOTES.md docker/etc-mongod-conf.yaml

echo -e "\nOutput: $ZIP_FILE\n"
