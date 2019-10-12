var Attr = {};

const def = (key, value) => Object.defineProperty(Attr, key, {value});

def("NORMAL", 0b00);
def("INTERPOLATED", 0b01);
def("SPREAD", 0b10);

def("NONE", 0b000);
def("PROP", 0b001);
def("STYLE", 0b010);
def("EVENT", 0b011);
def("WIDGET", 0b100);
def("UPDATE_WIDGET", 0b101);
def("EXTEND_WIDGET", 0b110);

module.exports = Attr;
